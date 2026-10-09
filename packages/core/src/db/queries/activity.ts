import { and, desc, eq, gte, inArray, isNull, lt, ne, notInArray, sql } from "drizzle-orm";
import type { Executor } from "../client";
import {
  comments,
  itemEvents,
  items,
  notifications,
  rateLimits,
  repos,
  reviews,
  syncRuns,
} from "../schema";
import { dayKey, median, streaks } from "../../derive";

/* ───────────────────────── Inbox ───────────────────────── */

export interface InboxEntry {
  key: string;
  source: "github" | "event";
  type: string;
  title: string;
  repoFullName: string;
  number: number | null;
  kind: string | null;
  itemId: string | null;
  actor: string | null;
  excerpt: string | null;
  url: string | null;
  at: string;
  unread: boolean;
  priority: string;
}

export interface InboxFilter {
  source?: "github" | "event" | "all";
  unread?: boolean;
  type?: string[];
  before?: string;
  limit?: number;
}

const HIDDEN_EVENT_TYPES = [
  "discovered",
  "label_removed",
  "review_request_removed",
  "title_changed",
];

export async function listInbox(
  db: Executor,
  f: InboxFilter = {},
): Promise<{ entries: InboxEntry[]; nextCursor: string | null; counts: Record<string, number> }> {
  const limit = Math.min(f.limit ?? 50, 200);
  const before = f.before ? new Date(f.before) : null;
  const wantGithub = f.source !== "event";
  const wantEvents = f.source !== "github";

  const [nRows, eRows] = await Promise.all([
    wantGithub
      ? db
          .select({ n: notifications, number: items.number, kind: items.kind })
          .from(notifications)
          .leftJoin(items, eq(items.id, notifications.itemId))
          .where(
            and(
              f.unread ? eq(notifications.unread, true) : undefined,
              f.type?.length ? inArray(notifications.reason, f.type) : undefined,
              before ? lt(notifications.updatedAt, before) : undefined,
            ),
          )
          .orderBy(desc(notifications.updatedAt))
          .limit(limit)
      : Promise.resolve([]),
    wantEvents
      ? db
          .select({
            e: itemEvents,
            title: items.title,
            repo: items.repoFullName,
            number: items.number,
            kind: items.kind,
            url: items.url,
          })
          .from(itemEvents)
          .innerJoin(items, eq(items.id, itemEvents.itemId))
          .where(
            and(
              notInArray(itemEvents.type, HIDDEN_EVENT_TYPES),
              ne(itemEvents.priority, "low"),
              f.unread ? isNull(itemEvents.readAt) : undefined,
              f.type?.length ? inArray(itemEvents.type, f.type) : undefined,
              before ? lt(itemEvents.occurredAt, before) : undefined,
            ),
          )
          .orderBy(desc(itemEvents.occurredAt))
          .limit(limit)
      : Promise.resolve([]),
  ]);

  const entries: InboxEntry[] = [
    ...nRows.map((r) => ({
      key: `n:${r.n.id}`,
      source: "github" as const,
      type: r.n.reason,
      title: r.n.title,
      repoFullName: r.n.repoFullName,
      number: r.number ?? null,
      kind:
        r.kind ??
        (r.n.subjectType === "PullRequest"
          ? "pr"
          : r.n.subjectType === "Issue"
            ? "issue"
            : r.n.subjectType.toLowerCase()),
      itemId: r.n.itemId,
      actor: null,
      excerpt: null,
      url: r.n.htmlUrl,
      at: r.n.updatedAt.toISOString(),
      unread: r.n.unread,
      priority: ["mention", "review_requested", "assign"].includes(r.n.reason) ? "high" : "normal",
    })),
    ...eRows.map((r) => ({
      key: `e:${r.e.id}`,
      source: "event" as const,
      type: r.e.type,
      title: r.title,
      repoFullName: r.repo,
      number: r.number,
      kind: r.kind,
      itemId: r.e.itemId,
      actor: r.e.actor,
      excerpt:
        typeof r.e.payload.excerpt === "string"
          ? r.e.payload.excerpt
          : Array.isArray(r.e.payload.checks)
            ? (r.e.payload.checks as string[]).join(", ")
            : null,
      url: typeof r.e.payload.url === "string" ? r.e.payload.url : r.url,
      at: r.e.occurredAt.toISOString(),
      unread: r.e.readAt == null,
      priority: r.e.priority,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);

  const [nc] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(eq(notifications.unread, true));
  const [ec] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(itemEvents)
    .where(
      and(
        isNull(itemEvents.readAt),
        ne(itemEvents.priority, "low"),
        notInArray(itemEvents.type, HIDDEN_EVENT_TYPES),
      ),
    );

  return {
    entries,
    nextCursor: entries.length === limit ? (entries[entries.length - 1]?.at ?? null) : null,
    counts: { github: nc?.n ?? 0, event: ec?.n ?? 0, total: (nc?.n ?? 0) + (ec?.n ?? 0) },
  };
}

export async function unreadCount(db: Executor): Promise<number> {
  const [nc] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(eq(notifications.unread, true));
  const [ec] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(itemEvents)
    .where(
      and(
        isNull(itemEvents.readAt),
        ne(itemEvents.priority, "low"),
        notInArray(itemEvents.type, HIDDEN_EVENT_TYPES),
      ),
    );
  return (nc?.n ?? 0) + (ec?.n ?? 0);
}

/** Mark inbox entries (keys like `n:123` / `e:45`) read or unread. Returns GitHub thread ids touched. */
export async function setInboxRead(db: Executor, keys: string[], read: boolean): Promise<string[]> {
  const threadIds = keys.filter((k) => k.startsWith("n:")).map((k) => k.slice(2));
  const eventIds = keys
    .filter((k) => k.startsWith("e:"))
    .map((k) => Number(k.slice(2)))
    .filter(Number.isFinite);
  const now = new Date();
  if (threadIds.length)
    await db
      .update(notifications)
      .set({ unread: !read, lastReadAt: read ? now : null })
      .where(inArray(notifications.id, threadIds));
  if (eventIds.length)
    await db
      .update(itemEvents)
      .set({ readAt: read ? now : null })
      .where(inArray(itemEvents.id, eventIds));
  return threadIds;
}

export async function markAllRead(
  db: Executor,
  source: "github" | "event" | "all" = "all",
): Promise<void> {
  const now = new Date();
  if (source !== "event")
    await db
      .update(notifications)
      .set({ unread: false, lastReadAt: now })
      .where(eq(notifications.unread, true));
  if (source !== "github")
    await db.update(itemEvents).set({ readAt: now }).where(isNull(itemEvents.readAt));
}

export async function markItemSeen(db: Executor, itemId: string): Promise<void> {
  const now = new Date();
  await db
    .update(itemEvents)
    .set({ readAt: now })
    .where(and(eq(itemEvents.itemId, itemId), isNull(itemEvents.readAt)));
  await db
    .update(notifications)
    .set({ unread: false, lastReadAt: now })
    .where(and(eq(notifications.itemId, itemId), eq(notifications.unread, true)));
}

/* ───────────────────────── Insights ───────────────────────── */

export interface Insights {
  heatmap: { day: string; count: number }[];
  monthly: { month: string; opened: number; merged: number }[];
  byRepo: { repo: string; merged: number; open: number; closed: number }[];
  turnaround: {
    repo: string;
    firstResponseHours: number | null;
    mergeHours: number | null;
    samples: number;
  }[];
  responseBuckets: { bucket: string; count: number }[];
  languages: { language: string; count: number; color: string | null }[];
  streak: { current: number; longest: number };
  totals: {
    prsOpened: number;
    prsMerged: number;
    mergeRate: number | null;
    issuesOpened: number;
    reviewsGiven: number;
    commentsWritten: number;
    reposContributed: number;
    medianMergeHours: number | null;
    medianFirstResponseHours: number | null;
    activeDays: number;
  };
}

export async function getInsights(
  db: Executor,
  me: string,
  opts: { now?: Date; timeZone?: string } = {},
): Promise<Insights> {
  const now = opts.now ?? new Date();
  const tz = opts.timeZone ?? "UTC";
  const meLower = me.toLowerCase();
  const yearAgo = new Date(now.getTime() - 371 * 86_400_000);

  const [myItems, myComments, myReviews] = await Promise.all([
    db
      .select({
        repo: items.repoFullName,
        kind: items.kind,
        state: items.state,
        created: items.ghCreatedAt,
        merged: items.mergedAt,
        closed: items.closedAt,
        firstResponse: items.firstResponseAt,
        language: repos.language,
        languageColor: repos.languageColor,
      })
      .from(items)
      .leftJoin(repos, eq(repos.id, items.repoId))
      .where(
        and(
          sql`lower(${items.author}) = ${meLower}`,
          eq(items.isGone, false),
          ne(items.source, "planned"),
        ),
      ),
    db
      .select({ at: comments.createdAt })
      .from(comments)
      .where(and(eq(comments.isMine, true), gte(comments.createdAt, yearAgo))),
    db
      .select({ at: reviews.submittedAt })
      .from(reviews)
      .where(sql`lower(${reviews.reviewer}) = ${meLower}`),
  ]);

  const counts = new Map<string, number>();
  const bump = (d: Date | null) => {
    if (!d || d < yearAgo) return;
    const k = dayKey(d, tz);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  };
  for (const i of myItems) {
    bump(i.created);
    if (i.merged) bump(i.merged);
  }
  for (const c of myComments) bump(c.at);
  for (const r of myReviews) bump(r.at);

  const heatmap: Insights["heatmap"] = [];
  for (let d = 0; d < 371; d++) {
    const day = new Date(now.getTime() - (370 - d) * 86_400_000);
    const k = dayKey(day, tz);
    heatmap.push({ day: k, count: counts.get(k) ?? 0 });
  }

  const monthly: Insights["monthly"] = [];
  for (let m = 11; m >= 0; m--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    monthly.push({ month: key, opened: 0, merged: 0 });
  }
  const monthIdx = new Map(monthly.map((m, i) => [m.month, i]));
  const mk = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const prs = myItems.filter((i) => i.kind === "pr");
  for (const p of prs) {
    if (p.created) {
      const idx = monthIdx.get(mk(p.created));
      if (idx != null) monthly[idx]!.opened++;
    }
    if (p.merged) {
      const idx = monthIdx.get(mk(p.merged));
      if (idx != null) monthly[idx]!.merged++;
    }
  }

  const repoMap = new Map<
    string,
    { merged: number; open: number; closed: number; fr: number[]; tm: number[] }
  >();
  for (const p of prs) {
    const r = repoMap.get(p.repo) ?? { merged: 0, open: 0, closed: 0, fr: [], tm: [] };
    r[p.state === "merged" ? "merged" : p.state === "open" ? "open" : "closed"]++;
    if (p.created && p.firstResponse)
      r.fr.push((p.firstResponse.getTime() - p.created.getTime()) / 3_600_000);
    if (p.created && p.merged) r.tm.push((p.merged.getTime() - p.created.getTime()) / 3_600_000);
    repoMap.set(p.repo, r);
  }
  const byRepo = [...repoMap.entries()]
    .map(([repo, r]) => ({ repo, merged: r.merged, open: r.open, closed: r.closed }))
    .sort((a, b) => b.merged + b.open + b.closed - (a.merged + a.open + a.closed))
    .slice(0, 10);
  const turnaround = [...repoMap.entries()]
    .map(([repo, r]) => ({
      repo,
      firstResponseHours: median(r.fr),
      mergeHours: median(r.tm),
      samples: r.fr.length + r.tm.length,
    }))
    .filter((t) => t.samples > 0)
    .sort((a, b) => (a.mergeHours ?? Infinity) - (b.mergeHours ?? Infinity))
    .slice(0, 10);

  const buckets: [string, number][] = [
    ["< 1h", 1],
    ["1–6h", 6],
    ["6–24h", 24],
    ["1–3d", 72],
    ["3–7d", 168],
    ["1–2w", 336],
    ["> 2w", Infinity],
  ];
  const responseBuckets = buckets.map(([bucket]) => ({ bucket, count: 0 }));
  let never = 0;
  for (const i of myItems) {
    if (!i.created) continue;
    if (!i.firstResponse) {
      if (i.state === "open") never++;
      continue;
    }
    const h = (i.firstResponse.getTime() - i.created.getTime()) / 3_600_000;
    const idx = buckets.findIndex(([, max]) => h < max);
    responseBuckets[idx === -1 ? buckets.length - 1 : idx]!.count++;
  }
  responseBuckets.push({ bucket: "Waiting", count: never });

  const langMap = new Map<string, { count: number; color: string | null }>();
  for (const p of prs) {
    const l = p.language ?? "Other";
    const cur = langMap.get(l) ?? { count: 0, color: p.languageColor };
    cur.count++;
    langMap.set(l, cur);
  }

  const activeDays = new Set([...counts.entries()].filter(([, c]) => c > 0).map(([k]) => k));
  const merged = prs.filter((p) => p.state === "merged");
  const decided = prs.filter((p) => p.state !== "open");
  return {
    heatmap,
    monthly,
    byRepo,
    turnaround,
    responseBuckets,
    languages: [...langMap.entries()]
      .map(([language, v]) => ({ language, count: v.count, color: v.color }))
      .sort((a, b) => b.count - a.count),
    streak: streaks(activeDays, now, tz),
    totals: {
      prsOpened: prs.length,
      prsMerged: merged.length,
      mergeRate: decided.length ? merged.length / decided.length : null,
      issuesOpened: myItems.filter((i) => i.kind === "issue").length,
      reviewsGiven: myReviews.length,
      commentsWritten: myComments.length,
      reposContributed: new Set(prs.map((p) => p.repo.toLowerCase())).size,
      medianMergeHours: median(
        merged
          .filter((p) => p.created && p.merged)
          .map((p) => (p.merged!.getTime() - p.created!.getTime()) / 3_600_000),
      ),
      medianFirstResponseHours: median(
        myItems
          .filter((p) => p.created && p.firstResponse)
          .map((p) => (p.firstResponse!.getTime() - p.created!.getTime()) / 3_600_000),
      ),
      activeDays: activeDays.size,
    },
  };
}

/* ───────────────────────── Sync status ───────────────────────── */

export async function listSyncRuns(db: Executor, opts: { limit?: number; kind?: string } = {}) {
  return db
    .select()
    .from(syncRuns)
    .where(opts.kind ? sql`${syncRuns.kind} = ${opts.kind}` : undefined)
    .orderBy(desc(syncRuns.startedAt))
    .limit(Math.min(opts.limit ?? 50, 200));
}

export async function getSyncRun(db: Executor, id: string) {
  const rows = await db.select().from(syncRuns).where(eq(syncRuns.id, id)).limit(1);
  return rows[0] ?? null;
}

export interface SyncStatus {
  running: (typeof syncRuns.$inferSelect)[];
  lastSuccessAt: string | null;
  lastRun: typeof syncRuns.$inferSelect | null;
  lastFailure: { at: string; kind: string; error: string | null } | null;
  rate: { resource: string; limit: number; remaining: number; resetAt: string }[];
}

export async function getSyncStatus(db: Executor): Promise<SyncStatus> {
  const staleRunning = new Date(Date.now() - 30 * 60_000);
  const [running, lastSuccess, lastRun, lastFailure, rate] = await Promise.all([
    db
      .select()
      .from(syncRuns)
      .where(
        and(inArray(syncRuns.status, ["running", "queued"]), gte(syncRuns.startedAt, staleRunning)),
      )
      .orderBy(desc(syncRuns.startedAt))
      .limit(5),
    db
      .select({ at: syncRuns.finishedAt })
      .from(syncRuns)
      .where(
        and(inArray(syncRuns.status, ["success", "partial"]), ne(syncRuns.kind, "notifications")),
      )
      .orderBy(desc(syncRuns.finishedAt))
      .limit(1),
    db
      .select()
      .from(syncRuns)
      .where(ne(syncRuns.kind, "notifications"))
      .orderBy(desc(syncRuns.startedAt))
      .limit(1),
    db
      .select({
        at: syncRuns.startedAt,
        kind: syncRuns.kind,
        error: syncRuns.error,
        status: syncRuns.status,
      })
      .from(syncRuns)
      .orderBy(desc(syncRuns.startedAt))
      .limit(3),
    db.select().from(rateLimits),
  ]);
  const failed = lastFailure.find((r) => r.status === "failed");
  return {
    running,
    lastSuccessAt: lastSuccess[0]?.at?.toISOString() ?? null,
    lastRun: lastRun[0] ?? null,
    lastFailure:
      failed && lastFailure[0]?.status === "failed"
        ? { at: failed.at.toISOString(), kind: failed.kind, error: failed.error }
        : null,
    rate: rate.map((r) => ({
      resource: r.resource,
      limit: r.limit,
      remaining: r.remaining,
      resetAt: r.resetAt.toISOString(),
    })),
  };
}
