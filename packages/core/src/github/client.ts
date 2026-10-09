import { z } from "zod";
import { logger } from "../lib/logger";

const GRAPHQL_URL = "https://api.github.com/graphql";
const REST_URL = "https://api.github.com";

export class RateLimitLowError extends Error {
  constructor(
    public remaining: number,
    public resetAt: Date,
  ) {
    super(`GitHub rate limit low (${remaining} left, resets ${resetAt.toISOString()})`);
  }
}
export class GitHubAuthError extends Error {}
export class GitHubHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface RateInfo {
  resource: "graphql" | "core";
  limit: number;
  remaining: number;
  resetAt: Date;
  cost?: number;
}

const rateLimitSchema = z.object({
  cost: z.number(),
  remaining: z.number(),
  resetAt: z.string(),
  limit: z.number(),
  used: z.number().optional(),
});

const graphqlEnvelope = z.object({
  data: z.record(z.string(), z.unknown()).nullable().optional(),
  errors: z
    .array(
      z.object({
        message: z.string(),
        type: z.string().optional(),
        path: z.array(z.union([z.string(), z.number()])).optional(),
      }),
    )
    .optional(),
});

export interface GraphQLResult<T> {
  data: T;
  errors: { message: string; type?: string; path?: (string | number)[] }[];
  cost: number;
}

/** Exponential backoff with full jitter. Pure (random injected) for tests. */
export function backoffDelay(
  attempt: number,
  opts: { baseMs?: number; maxMs?: number; random?: () => number } = {},
): number {
  const base = opts.baseMs ?? 500;
  const max = opts.maxMs ?? 30_000;
  const rnd = opts.random ?? Math.random;
  const ceiling = Math.min(max, base * 2 ** attempt);
  return Math.round(ceiling / 2 + rnd() * (ceiling / 2));
}

/** Seconds to wait for a secondary rate limit / 429, from headers (Retry-After or x-ratelimit-reset). */
export function retryAfterMs(headers: Headers, now = Date.now()): number | null {
  const ra = headers.get("retry-after");
  if (ra && /^\d+$/.test(ra)) return Number(ra) * 1000;
  if (headers.get("x-ratelimit-remaining") === "0") {
    const reset = Number(headers.get("x-ratelimit-reset"));
    if (Number.isFinite(reset) && reset > 0) return Math.max(0, reset * 1000 - now);
  }
  return null;
}

export interface ClientOptions {
  token: string;
  fetch?: typeof fetch;
  /** Abort non-essential GraphQL work below this many points. */
  minRemaining?: number;
  maxRetries?: number;
  timeoutMs?: number;
  onRate?: (info: RateInfo) => void | Promise<void>;
  sleep?: (ms: number) => Promise<void>;
  userAgent?: string;
}

export class GitHubClient {
  private f: typeof fetch;
  private sleep: (ms: number) => Promise<void>;
  /** Total GraphQL points spent through this client. */
  public costSpent = 0;
  public lastRate: RateInfo | null = null;

  constructor(private opts: ClientOptions) {
    this.f = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Authorization: `bearer ${this.opts.token}`,
      "User-Agent": this.opts.userAgent ?? "contrib-dashboard",
      "X-GitHub-Api-Version": "2022-11-28",
      ...extra,
    };
  }

  private async request(url: string, init: RequestInit, label: string): Promise<Response> {
    const maxRetries = this.opts.maxRetries ?? 4;
    for (let attempt = 0; ; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.opts.timeoutMs ?? 30_000);
      let res: Response | null = null;
      let netErr: unknown = null;
      try {
        res = await this.f(url, { ...init, signal: ctrl.signal });
      } catch (err) {
        netErr = err;
      } finally {
        clearTimeout(timer);
      }
      if (res) {
        if (res.status === 401) throw new GitHubAuthError("GitHub rejected the token (401)");
        const limited =
          res.status === 429 ||
          (res.status === 403 &&
            (res.headers.get("retry-after") != null ||
              res.headers.get("x-ratelimit-remaining") === "0"));
        if (limited) {
          const wait =
            retryAfterMs(res.headers) ?? backoffDelay(attempt, { baseMs: 60_000, maxMs: 120_000 });
          if (attempt >= maxRetries || wait > 15 * 60_000)
            throw new GitHubHttpError(res.status, `rate limited on ${label}`);
          logger.warn({ label, wait, status: res.status }, "GitHub rate limited, backing off");
          await this.sleep(Math.min(wait, 120_000));
          continue;
        }
        if (res.status >= 500 && attempt < maxRetries) {
          await this.sleep(backoffDelay(attempt));
          continue;
        }
        return res;
      }
      if (attempt >= maxRetries) throw netErr instanceof Error ? netErr : new Error(String(netErr));
      await this.sleep(backoffDelay(attempt));
    }
  }

  async graphql<T>(
    query: string,
    variables: Record<string, unknown>,
    opts: { essential?: boolean } = {},
  ): Promise<GraphQLResult<T>> {
    const min = this.opts.minRemaining ?? 0;
    if (
      !opts.essential &&
      this.lastRate &&
      this.lastRate.remaining < min &&
      this.lastRate.resetAt.getTime() > Date.now()
    ) {
      throw new RateLimitLowError(this.lastRate.remaining, this.lastRate.resetAt);
    }
    const res = await this.request(
      GRAPHQL_URL,
      {
        method: "POST",
        headers: this.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ query, variables }),
      },
      "graphql",
    );
    const text = await res.text();
    if (!res.ok)
      throw new GitHubHttpError(res.status, `GraphQL HTTP ${res.status}: ${text.slice(0, 200)}`);
    const parsed = graphqlEnvelope.parse(JSON.parse(text));
    const data = (parsed.data ?? {}) as Record<string, unknown>;
    const rl = rateLimitSchema.safeParse(data.rateLimit);
    let cost = 0;
    if (rl.success) {
      cost = rl.data.cost;
      this.costSpent += cost;
      this.lastRate = {
        resource: "graphql",
        limit: rl.data.limit,
        remaining: rl.data.remaining,
        resetAt: new Date(rl.data.resetAt),
        cost,
      };
      await this.opts.onRate?.(this.lastRate);
    }
    const errors = parsed.errors ?? [];
    if (!parsed.data && errors.length)
      throw new GitHubHttpError(200, errors.map((e) => e.message).join("; "));
    return { data: data as T, errors, cost };
  }

  /** REST GET with conditional request support. 304s are free. */
  async rest<T>(
    path: string,
    opts: {
      ifModifiedSince?: string | null;
      etag?: string | null;
      method?: string;
      body?: unknown;
    } = {},
  ) {
    const extra: Record<string, string> = { Accept: "application/vnd.github+json" };
    if (opts.ifModifiedSince) extra["If-Modified-Since"] = opts.ifModifiedSince;
    if (opts.etag) extra["If-None-Match"] = opts.etag;
    if (opts.body !== undefined) extra["Content-Type"] = "application/json";
    const res = await this.request(
      path.startsWith("http") ? path : `${REST_URL}${path}`,
      {
        method: opts.method ?? "GET",
        headers: this.headers(extra),
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      },
      `rest ${path}`,
    );
    const limit = Number(res.headers.get("x-ratelimit-limit"));
    const remaining = Number(res.headers.get("x-ratelimit-remaining"));
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    if (Number.isFinite(limit) && limit > 0 && Number.isFinite(remaining)) {
      await this.opts.onRate?.({
        resource: "core",
        limit,
        remaining,
        resetAt: new Date(reset * 1000),
      });
    }
    if (res.status === 304) return { status: 304 as const, data: null, headers: res.headers };
    if (res.status >= 400) throw new GitHubHttpError(res.status, `REST ${path} → ${res.status}`);
    const text = await res.text();
    return {
      status: res.status,
      data: (text ? JSON.parse(text) : null) as T | null,
      headers: res.headers,
    };
  }
}
