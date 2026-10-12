import { and, eq, gte, inArray, isNotNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client";
import { itemEvents, items, notifications, rateLimits, syncRuns } from "../db/schema";
import { getSettings, getState, setState } from "../db/settings";
import { GitHubAuthError, GitHubClient, RateLimitLowError, type RateInfo } from "../github/client";
import { getGithubToken } from "../github/account";
import { normalizeNode } from "../github/normalize";
import { HYDRATE_QUERY, RESOLVE_QUERY, SEARCH_QUERY } from "../github/queries";
import { logger } from "../lib/logger";
import type { Relation, Settings, SyncProgress } from "../types";
import { buildSearchQueries, chunk, partitionWindows, windowQualifier } from "./discovery";
import { markGone, persistSnapshot } from "./persist";

/** Prefer the database's own message over Drizzle's "Failed query: <sql>" wrapper. */
function errorText(err: unknown): string {
  const e = err as Error & { cause?: { message?: string; code?: string } };
  return e.cause?.message
    ? `${e.cause.code ?? ""} ${e.cause.message}`.trim()
    : (e.message ?? String(err)).slice(0, 300);
}

export type SyncKind = "hot" | "warm" | "cold" | "notifications" | "item" | "demo";

export interface SyncContext {
  db: Db;
  client: GitHubClient;
  me: string;
  settings: Settings;
  now: Date;
  runId: string;
  progress: (p: SyncProgress) => Promise<void>;
  errors: { scope: string; message: string }[];
  stats: { itemsTouched: number; eventsCreated: number };
}

const HYDRATE_BATCH = 20;

export async function recordRate(db: Db, info: RateInfo): Promise<void> {
  await db
    .insert(rateLimits)
    .values({
      resource: info.resource,
      bucket: "default",
      limit: info.limit,
      remaining: info.remaining,
      resetAt: info.resetAt,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [rateLimits.resource, rateLimits.bucket],
      set: {
        limit: info.limit,
        remaining: info.remaining,
        resetAt: info.resetAt,
        updatedAt: new Date(),
      },
    });
}

const searchResult = z.object({
  search: z.object({
    issueCount: z.number(),
    discussionCount: z.number().nullish(),
    pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullish() }),
    nodes: z.array(
      z
        .object({
          __typename: z.string(),
          id: z.string().optional(),
          updatedAt: z.string().optional(),
        })
        .nullable(),
    ),
  }),
});

/* ───────────────────────── Discovery ───────────────────────── */

export async function discover(
  ctx: SyncContext,
  opts: { since: Date; scope: "full" | "incremental" },
): Promise<Map<string, Set<Relation>>> {
  const found = new Map<string, Set<Relation>>();
  const specs = buildSearchQueries(ctx.me, { ...ctx.settings.sync, scope: opts.scope });
  let done = 0;
  for (const spec of specs) {
    await ctx.progress({ phase: "discovery", done, total: specs.length, message: spec.q });
    try {
      const count = async (from: Date, to: Date) => {
        const res = await ctx.client.graphql<unknown>(SEARCH_QUERY, {
          q: `${spec.q} ${windowQualifier(from, to)}`,
          type: spec.type,
          after: null,
        });
        const s = searchResult.parse(res.data).search;
        return spec.type === "DISCUSSION" ? (s.discussionCount ?? s.issueCount) : s.issueCount;
      };
      const windows = await partitionWindows(opts.since, ctx.now, count);
      for (const w of windows) {
        let after: string | null = null;
        for (let page = 0; page < 10; page++) {
          const res: { data: unknown } = await ctx.client.graphql<unknown>(SEARCH_QUERY, {
            q: `${spec.q} ${windowQualifier(w.from, w.to)}`,
            type: spec.type,
            after,
          });
          const s: z.infer<typeof searchResult>["search"] = searchResult.parse(res.data).search;
          for (const n of s.nodes) {
            if (!n?.id) continue;
            const set = found.get(n.id) ?? new Set<Relation>();
            set.add(spec.relation);
            found.set(n.id, set);
          }
          if (!s.pageInfo.hasNextPage || !s.pageInfo.endCursor) break;
          after = s.pageInfo.endCursor;
        }
      }
    } catch (err) {
      if (err instanceof RateLimitLowError || err instanceof GitHubAuthError) throw err;
      ctx.errors.push({ scope: `search:${spec.q}`, message: (err as Error).message });
    }
    done++;
  }
  return found;
}

/* ───────────────────────── Hydration ───────────────────────── */

export async function hydrate(
  ctx: SyncContext,
  ids: string[],
  relations: Map<string, Set<Relation>> = new Map(),
  opts: { initialImport?: boolean; source?: "github" | "manual" } = {},
): Promise<void> {
  const unique = [...new Set(ids)].filter(
    (id) => !id.startsWith("planned_") && !id.startsWith("manual_"),
  );
  const batches = chunk(unique, HYDRATE_BATCH);
  let done = 0;
  for (const batch of batches) {
    await ctx.progress({ phase: "hydrate", done, total: unique.length });
    try {
      const res = await ctx.client.graphql<{ nodes: unknown[] }>(HYDRATE_QUERY, { ids: batch });
      const nodes = res.data.nodes ?? [];
      for (let i = 0; i < batch.length; i++) {
        const id = batch[i]!;
        const raw = nodes[i];
        if (raw == null) {
          const err = res.errors.find((e) => e.path?.[1] === i);
          await markGone(ctx.db, id, err?.message ?? "Not found");
          ctx.errors.push({
            scope: `hydrate:${id}`,
            message: err?.message ?? "Could not resolve node (deleted, transferred or access lost)",
          });
          continue;
        }
        const snap = normalizeNode(raw);
        if (!snap) {
          ctx.errors.push({ scope: `hydrate:${id}`, message: "Unrecognized node shape" });
          continue;
        }
        try {
          const r = await persistSnapshot(ctx.db, snap, {
            me: ctx.me,
            now: ctx.now,
            stale: ctx.settings.stale,
            discoveredRelations: [...(relations.get(id) ?? [])],
            initialImport: opts.initialImport,
            source: opts.source,
          });
          ctx.stats.itemsTouched++;
          ctx.stats.eventsCreated += r.eventsCreated;
        } catch (err) {
          ctx.errors.push({
            scope: `persist:${snap.repo.fullName}#${snap.number}`,
            message: errorText(err),
          });
        }
      }
    } catch (err) {
      if (err instanceof RateLimitLowError || err instanceof GitHubAuthError) throw err;
      ctx.errors.push({ scope: `hydrate-batch:${batch[0]}`, message: (err as Error).message });
    }
    done += batch.length;
  }
  await ctx.progress({ phase: "hydrate", done: unique.length, total: unique.length });
}

/** Resolve owner/name#number → node id via GraphQL. */
export async function resolveNumber(
  client: GitHubClient,
  owner: string,
  name: string,
  number: number,
): Promise<string | null> {
  const res = await client.graphql<{
    repository: {
      issueOrPullRequest: { id?: string } | null;
      discussion: { id: string } | null;
    } | null;
  }>(RESOLVE_QUERY, { owner, name, number }, { essential: true });
  return res.data.repository?.issueOrPullRequest?.id ?? res.data.repository?.discussion?.id ?? null;
}

/* ───────────────────────── Notifications ───────────────────────── */

const notificationSchema = z.object({
  id: z.string(),
  reason: z.string(),
  unread: z.boolean(),
  updated_at: z.string(),
  last_read_at: z.string().nullable(),
  subject: z.object({
    title: z.string(),
    url: z.string().nullable(),
    type: z.string(),
    latest_comment_url: z.string().nullable().optional(),
  }),
  repository: z.object({ full_name: z.string(), html_url: z.string() }),
});

const SUBJECT_RE = /\/repos\/([^/]+)\/([^/]+)\/(issues|pulls|discussions)\/(\d+)/;

/** Conditional poll of /notifications. Returns item ids that changed and the server-requested interval. */
export async function pollNotifications(
  ctx: SyncContext,
): Promise<{ changed: string[]; pollInterval: number; notModified: boolean }> {
  const state =
    (await getState<{ lastModified?: string; pollInterval?: number }>(
      ctx.db,
      "state.notifications",
    )) ?? {};
  const res = await ctx.client.rest<unknown[]>(
    "/notifications?all=false&participating=false&per_page=50",
    { ifModifiedSince: state.lastModified },
  );
  const pollInterval = Math.max(
    ctx.settings.sync.notificationsMinSeconds,
    Number(res.headers.get("x-poll-interval") ?? 60),
  );
  if (res.status === 304) {
    await setState(ctx.db, "state.notifications", { ...state, pollInterval });
    return { changed: [], pollInterval, notModified: true };
  }
  const list = z.array(notificationSchema).parse(res.data ?? []);
  const changed: string[] = [];
  for (const n of list) {
    const m = SUBJECT_RE.exec(n.subject.url ?? "");
    let itemId: string | null = null;
    let htmlUrl = n.repository.html_url;
    if (m) {
      const [, owner, name, kind, num] = m;
      htmlUrl = `https://github.com/${owner}/${name}/${kind === "pulls" ? "pull" : kind}/${num}`;
      const existing = await ctx.db
        .select({ id: items.id, hydrated: items.lastHydratedAt })
        .from(items)
        .where(
          and(
            sql`lower(${items.repoFullName}) = ${`${owner}/${name}`.toLowerCase()}`,
            eq(items.number, Number(num)),
          ),
        )
        .limit(1);
      itemId = existing[0]?.id ?? null;
      if (!itemId) {
        try {
          itemId = await resolveNumber(ctx.client, owner!, name!, Number(num));
        } catch (err) {
          ctx.errors.push({ scope: `notification:${n.id}`, message: (err as Error).message });
        }
      }
      if (itemId && (!existing[0]?.hydrated || existing[0].hydrated < new Date(n.updated_at)))
        changed.push(itemId);
    }
    const knownItem = itemId
      ? (await ctx.db.select({ id: items.id }).from(items).where(eq(items.id, itemId)).limit(1))[0]
      : undefined;
    await ctx.db
      .insert(notifications)
      .values({
        id: n.id,
        itemId: knownItem?.id ?? null,
        reason: n.reason,
        title: n.subject.title,
        subjectType: n.subject.type,
        subjectUrl: n.subject.url,
        htmlUrl,
        repoFullName: n.repository.full_name,
        unread: n.unread,
        updatedAt: new Date(n.updated_at),
        lastReadAt: n.last_read_at ? new Date(n.last_read_at) : null,
      })
      .onConflictDoUpdate({
        target: notifications.id,
        set: {
          reason: n.reason,
          title: n.subject.title,
          unread: n.unread,
          updatedAt: new Date(n.updated_at),
          lastReadAt: n.last_read_at ? new Date(n.last_read_at) : null,
          itemId: sql`coalesce(excluded.item_id, ${notifications.itemId})`,
        },
      });
  }
  await setState(ctx.db, "state.notifications", {
    lastModified: res.headers.get("last-modified") ?? state.lastModified,
    pollInterval,
  });
  return { changed: [...new Set(changed)], pollInterval, notModified: false };
}

/** After hydrating, attach notifications that referenced not-yet-known items. */
async function linkOrphanNotifications(db: Db): Promise<void> {
  await db.execute(sql`
    update notifications n set item_id = i.id
    from items i
    where n.item_id is null and n.html_url is not null and i.url = n.html_url`);
}

/* ───────────────────────── Runner ───────────────────────── */

export interface RunOptions {
  trigger?: string;
  /** item kind: GitHub node ids to refresh */
  itemIds?: string[];
  source?: "github" | "manual";
  client?: GitHubClient;
  me?: string;
  now?: Date;
}

export interface RunResult {
  runId: string;
  status: "success" | "partial" | "failed";
  itemsTouched: number;
  eventsCreated: number;
  apiCost: number;
  pollInterval?: number;
  error?: string;
}

async function openItemIds(db: Db): Promise<string[]> {
  const rows = await db
    .select({ id: items.id })
    .from(items)
    .where(
      and(
        eq(items.state, "open"),
        eq(items.isGone, false),
        inArray(items.source, ["github", "manual"]),
        isNotNull(items.number),
      ),
    );
  return rows.map((r) => r.id);
}

async function recentlyClosedIds(db: Db, since: Date): Promise<string[]> {
  const rows = await db
    .select({ id: items.id })
    .from(items)
    .where(
      and(
        eq(items.isGone, false),
        inArray(items.state, ["closed", "merged"]),
        or(gte(items.closedAt, since), gte(items.mergedAt, since)),
      ),
    );
  return rows.map((r) => r.id);
}

export async function runSync(db: Db, kind: SyncKind, opts: RunOptions = {}): Promise<RunResult> {
  const now = opts.now ?? new Date();
  const [run] = await db
    .insert(syncRuns)
    .values({
      kind,
      trigger: opts.trigger ?? "schedule",
      status: "running",
      startedAt: now,
      target: opts.itemIds?.slice(0, 5).join(",") ?? null,
    })
    .returning({ id: syncRuns.id });
  const runId = run!.id;
  const log = logger.child({ runId, kind });
  const settings = await getSettings(db);

  let client = opts.client;
  let me = opts.me;
  if (!client) {
    const tok = await getGithubToken(db);
    if (!tok) {
      await db
        .update(syncRuns)
        .set({ status: "failed", finishedAt: new Date(), error: "No GitHub token configured" })
        .where(eq(syncRuns.id, runId));
      return {
        runId,
        status: "failed",
        itemsTouched: 0,
        eventsCreated: 0,
        apiCost: 0,
        error: "No GitHub token configured",
      };
    }
    client = new GitHubClient({
      token: tok.token,
      minRemaining: settings.sync.minRateRemaining,
      onRate: (r) => recordRate(db, r),
    });
    me = me ?? tok.login ?? undefined;
  }
  if (!me) {
    const { VIEWER_QUERY } = await import("../github/queries");
    const v = await client.graphql<{ viewer: { login: string } }>(
      VIEWER_QUERY,
      {},
      { essential: true },
    );
    me = v.data.viewer.login;
  }

  let lastProgressWrite = 0;
  const ctx: SyncContext = {
    db,
    client,
    me,
    settings,
    now,
    runId,
    errors: [],
    stats: { itemsTouched: 0, eventsCreated: 0 },
    progress: async (p) => {
      const t = Date.now();
      if (t - lastProgressWrite < 400 && p.done !== p.total) return;
      lastProgressWrite = t;
      await db
        .update(syncRuns)
        .set({ progress: p, itemsTouched: ctx.stats.itemsTouched })
        .where(eq(syncRuns.id, runId));
    },
  };

  let pollInterval: number | undefined;
  let fatal: string | undefined;
  try {
    switch (kind) {
      case "cold": {
        const hadAny =
          (
            await db
              .select({ n: sql<number>`count(*)::int` })
              .from(items)
              .where(eq(items.source, "github"))
          )[0]?.n ?? 0;
        const since = new Date(now.getTime() - settings.sync.discoveryLookbackDays * 86_400_000);
        const found = await discover(ctx, { since, scope: "full" });
        // Resumable on serverless time limits: items hydrated in the last 2h are skipped,
        // so a cold run that was cut short continues where it stopped next time.
        const fresh = new Set(
          (
            await db
              .select({ id: items.id })
              .from(items)
              .where(gte(items.lastHydratedAt, new Date(now.getTime() - 2 * 3_600_000)))
          ).map((r) => r.id),
        );
        const ids = [...new Set([...found.keys(), ...(await openItemIds(db))])].filter(
          (id) => !fresh.has(id),
        );
        await hydrate(ctx, ids, found, { initialImport: hadAny === 0 });
        // Only a clean run counts; otherwise the next cron tick retries the full sync.
        if (ctx.errors.length === 0)
          await setState(db, "state.lastCold", { at: now.toISOString() });
        break;
      }
      case "hot": {
        const found = await discover(ctx, {
          since: new Date(now.getTime() - 2 * 86_400_000),
          scope: "incremental",
        });
        await hydrate(ctx, [...new Set([...found.keys(), ...(await openItemIds(db))])], found);
        break;
      }
      case "warm": {
        await hydrate(
          ctx,
          await recentlyClosedIds(
            db,
            new Date(now.getTime() - settings.sync.warmWindowDays * 86_400_000),
          ),
        );
        break;
      }
      case "notifications": {
        const res = await pollNotifications(ctx);
        pollInterval = res.pollInterval;
        if (res.changed.length) await hydrate(ctx, res.changed);
        break;
      }
      case "item": {
        await hydrate(ctx, opts.itemIds ?? [], new Map(), { source: opts.source });
        break;
      }
      case "demo":
        break;
    }
    await linkOrphanNotifications(db);
  } catch (err) {
    fatal = err instanceof Error ? err.message : String(err);
    log.error({ err }, "sync run failed");
  }

  const status: RunResult["status"] = fatal ? "failed" : ctx.errors.length ? "partial" : "success";
  await db
    .update(syncRuns)
    .set({
      status,
      finishedAt: new Date(),
      itemsTouched: ctx.stats.itemsTouched,
      eventsCreated: ctx.stats.eventsCreated,
      apiCost: client.costSpent,
      rateRemaining: client.lastRate?.remaining ?? null,
      error: fatal ?? (ctx.errors.length ? `${ctx.errors.length} problem(s) during sync` : null),
      errors: ctx.errors.slice(0, 50),
      progress: { phase: "done", done: ctx.stats.itemsTouched, total: ctx.stats.itemsTouched },
    })
    .where(eq(syncRuns.id, runId));
  log.info(
    {
      status,
      ...ctx.stats,
      cost: client.costSpent,
      errors: ctx.errors.length,
      errorDetails: ctx.errors.slice(0, 5),
    },
    "sync run finished",
  );
  return { runId, status, ...ctx.stats, apiCost: client.costSpent, pollInterval, error: fatal };
}

/** Demo-mode "sync": a short simulated run so the progress UI is explorable without GitHub. */
export async function runDemoSync(db: Db, trigger = "manual"): Promise<string> {
  const [run] = await db
    .insert(syncRuns)
    .values({
      kind: "demo",
      trigger,
      status: "running",
      progress: { phase: "discovery", done: 0, total: 10 },
    })
    .returning({ id: syncRuns.id });
  const id = run!.id;
  const total = (await db.select({ n: sql<number>`count(*)::int` }).from(items))[0]?.n ?? 40;
  void (async () => {
    const steps: SyncProgress[] = [
      { phase: "discovery", done: 4, total: 10, message: "involves:vidhisingh24" },
      { phase: "discovery", done: 10, total: 10 },
      { phase: "hydrate", done: Math.round(total / 2), total },
      { phase: "hydrate", done: total, total },
    ];
    for (const p of steps) {
      await new Promise((r) => setTimeout(r, 650));
      await db
        .update(syncRuns)
        .set({ progress: p, itemsTouched: p.phase === "hydrate" ? p.done : 0 })
        .where(eq(syncRuns.id, id));
    }
    await db
      .update(syncRuns)
      .set({
        status: "success",
        finishedAt: new Date(),
        itemsTouched: total,
        apiCost: 0,
        progress: { phase: "done", done: total, total },
      })
      .where(eq(syncRuns.id, id));
  })().catch((err: unknown) => logger.error({ err }, "demo sync failed"));
  return id;
}

export async function pendingHighPriorityEvents(db: Db) {
  return db
    .select({
      e: itemEvents,
      title: items.title,
      repo: items.repoFullName,
      number: items.number,
      url: items.url,
    })
    .from(itemEvents)
    .innerJoin(items, eq(items.id, itemEvents.itemId))
    .where(and(sql`${itemEvents.dispatchedAt} is null`, eq(itemEvents.priority, "high")))
    .limit(100);
}
