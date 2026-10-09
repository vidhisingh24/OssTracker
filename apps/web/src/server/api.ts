import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type z } from "zod";
import type { Db } from "@contrib/core/db";
import { getEnv } from "@contrib/core/env";
import { logger } from "@contrib/core/logger";
import { appDb } from "./db";
import { getViewer, type Viewer } from "./session";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = "Not found") => new HttpError(404, what);
export const badRequest = (msg: string) => new HttpError(400, msg);

export interface ApiContext {
  req: NextRequest;
  db: Db;
  viewer: Viewer;
  params: Record<string, string>;
}

interface Options {
  /** State-changing route: enforces same-origin, JSON body and rate limiting. */
  mutation?: boolean;
  /** Requests per minute for this route (mutations default 120). */
  rateLimit?: number;
  /** Skip the session check (health, webhooks, auth). */
  public?: boolean;
}

/* ───────────── Rate limiting (single-process, per route) ───────────── */

const buckets = new Map<string, number[]>();
function allow(key: string, perMinute: number): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < 60_000);
  if (hits.length >= perMinute) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}

/* ───────────── CSRF: same-origin + JSON-only mutations ───────────── */

function sameOrigin(req: NextRequest): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = req.headers.get("origin");
  if (!origin) return site === "same-origin";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    const o = new URL(origin);
    if (host && o.host === host) return true;
    return o.origin === new URL(getEnv().APP_URL).origin;
  } catch {
    return false;
  }
}

export function api<T>(fn: (ctx: ApiContext) => Promise<T | Response>, opts: Options = {}) {
  return async (
    req: NextRequest,
    context: { params: Promise<Record<string, string>> },
  ): Promise<Response> => {
    const started = Date.now();
    try {
      const viewer = await getViewer();
      if (!opts.public && !viewer)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      if (opts.mutation) {
        if (!sameOrigin(req))
          return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
        const ct = req.headers.get("content-type") ?? "";
        const hasBody = req.method !== "DELETE" && req.headers.get("content-length") !== "0";
        if (hasBody && !ct.includes("application/json") && !ct.includes("multipart/form-data")) {
          return NextResponse.json({ error: "Expected application/json" }, { status: 415 });
        }
        const limit = opts.rateLimit ?? 120;
        if (
          !allow(`${req.method}:${req.nextUrl.pathname.replace(/\/[^/]{20,}/g, "/:id")}`, limit)
        ) {
          return NextResponse.json(
            { error: "Too many requests" },
            { status: 429, headers: { "Retry-After": "30" } },
          );
        }
      } else if (
        opts.rateLimit &&
        !allow(`${req.method}:${req.nextUrl.pathname}`, opts.rateLimit)
      ) {
        return NextResponse.json(
          { error: "Too many requests" },
          { status: 429, headers: { "Retry-After": "30" } },
        );
      }
      const db = await appDb();
      const params = await context.params;
      const result = await fn({
        req,
        db,
        viewer: viewer ?? {
          login: getEnv().ALLOWED_GITHUB_LOGIN,
          name: null,
          avatarUrl: null,
          demo: true,
        },
        params,
      });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true }, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (err) {
      if (err instanceof ZodError) {
        return NextResponse.json(
          {
            error: "Invalid request",
            issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
          },
          { status: 400 },
        );
      }
      if (err instanceof HttpError)
        return NextResponse.json(
          { error: err.message, details: err.details },
          { status: err.status },
        );
      logger.error({ err, path: req.nextUrl.pathname, ms: Date.now() - started }, "api error");
      return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
    }
  };
}

export async function jsonBody<S extends z.ZodType>(
  req: NextRequest,
  schema: S,
): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw badRequest("Body must be valid JSON");
  }
  return schema.parse(raw);
}
