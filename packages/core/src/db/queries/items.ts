import {
  and,
  asc,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNotNull,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { Executor } from "../client";
import {
  checkRuns,
  comments,
  itemEvents,
  itemLinks,
  items,
  notifications,
  repoMeta,
  repos,
  reviews,
  userMeta,
} from "../schema";
import { computeAttention, needsYou } from "../../derive";
import { EMPTY_META, type Ball, type ItemMeta, type ItemRow, type Stage } from "../../types";
import type { ItemFilter } from "./filters";

type ItemRecord = typeof items.$inferSelect;
type MetaRecord = typeof userMeta.$inferSelect;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function metaFromRecord(m: MetaRecord | null | undefined): ItemMeta {
  if (!m) return { ...EMPTY_META };
  return {
    personalStage: m.personalStage,
    priority: m.priority,
    tags: m.tags,
    notes: m.notes,
    dueAt: iso(m.dueAt),
    remindAt: iso(m.remindAt),
    snoozedUntil: iso(m.snoozedUntil),
    pinned: m.pinned,
    archived: m.archived,
    ballOverride: m.ballOverride,
    waitingOn: m.waitingOn,
    lastViewedAt: iso(m.lastViewedAt),
  };
}

export function toItemRow(
  i: ItemRecord,
  m: MetaRecord | null | undefined,
  extras: { programTag?: string | null; reviewers?: ItemRow["reviewers"] },
  now: Date,
): ItemRow {
  const meta = metaFromRecord(m);
  const { score, reasons } = computeAttention(
    { state: i.state, syncReasons: i.attentionReasons, lastActivityAt: i.lastActivityAt },
    {
      priority: meta.priority,
      dueAt: meta.dueAt,
      remindAt: meta.remindAt,
      remindedAt: m?.remindedAt ?? null,
      snoozedUntil: meta.snoozedUntil,
      archived: meta.archived,
      pinned: meta.pinned,
    },
    now,
  );
  const lastActivity = i.lastActivityAt ?? i.ghUpdatedAt;
  return {
    id: i.id,
    kind: i.kind,
    source: i.source,
    repoFullName: i.repoFullName,
    number: i.number,
    title: i.title,
    url: i.url,
    state: i.state,
    isDraft: i.isDraft,
    author: i.author,
    authorAvatarUrl: i.authorAvatarUrl,
    labels: i.labels,
    myRelation: i.myRelation,
    ciState: i.ciState,
    reviewDecision: i.reviewDecision,
    mergeable: i.mergeable,
    unresolvedThreads: i.unresolvedThreads,
    commentsCount: i.commentsCount,
    additions: i.additions,
    deletions: i.deletions,
    stage: i.stage,
    effectiveStage: (meta.personalStage ?? i.stage) as Stage,
    ball: i.ball,
    effectiveBall: (meta.ballOverride ?? i.ball) as Ball,
    attentionScore: score,
    attentionReasons: reasons,
    nextAction: i.nextAction,
    isStale: i.isStale,
    ghCreatedAt: iso(i.ghCreatedAt),
    ghUpdatedAt: iso(i.ghUpdatedAt),
    closedAt: iso(i.closedAt),
    mergedAt: iso(i.mergedAt),
    lastActivityAt: iso(i.lastActivityAt),
    lastHydratedAt: iso(i.lastHydratedAt),
    reviewers: extras.reviewers ?? [],
    meta,
    programTag: extras.programTag ?? null,
    hasUnseenActivity:
      !!lastActivity &&
      (!meta.lastViewedAt || lastActivity.getTime() > Date.parse(meta.lastViewedAt)),
  };
}

/** Latest effective review state per reviewer for a set of items (one query, no N+1). */
export async function reviewersFor(
  db: Executor,
  ids: string[],
): Promise<Map<string, ItemRow["reviewers"]>> {
  const out = new Map<string, ItemRow["reviewers"]>();
  if (ids.length === 0) return out;
  const rows = await db
    .select({
      itemId: reviews.itemId,
      reviewer: reviews.reviewer,
      avatar: reviews.reviewerAvatarUrl,
      state: reviews.state,
      at: reviews.submittedAt,
    })
    .from(reviews)
    .where(and(inArray(reviews.itemId, ids), ne(reviews.state, "PENDING")))
    .orderBy(asc(reviews.submittedAt));
  const latest = new Map<
    string,
    Map<string, { login: string; avatarUrl: string | null; state: string }>
  >();
  for (const r of rows) {
    const m = latest.get(r.itemId) ?? new Map();
    const prev = m.get(r.reviewer.toLowerCase());
    if (!(r.state === "COMMENTED" && prev && prev.state !== "COMMENTED")) {
      m.set(r.reviewer.toLowerCase(), { login: r.reviewer, avatarUrl: r.avatar, state: r.state });
    }
    latest.set(r.itemId, m);
  }
  // Pending review requests show as "REQUESTED"
  const reqRows = await db
    .select({ id: items.id, req: items.reviewRequests, author: items.author })
    .from(items)
    .where(inArray(items.id, ids));
  for (const r of reqRows) {
    const m = latest.get(r.id) ?? new Map();
    for (const q of r.req)
      if (!m.has(q.login.toLowerCase()))
        m.set(q.login.toLowerCase(), {
          login: q.login,
          avatarUrl: q.avatarUrl ?? null,
          state: "REQUESTED",
        });
    for (const key of m.keys()) if (r.author && key === r.author.toLowerCase()) m.delete(key);
    latest.set(r.id, m);
  }
  for (const [id, m] of latest) out.set(id, [...m.values()]);
  return out;
}

function whereFor(f: ItemFilter): SQL | undefined {
  const conds: (SQL | undefined)[] = [];
  const effStage = sql`coalesce(${userMeta.personalStage}, ${items.stage})`;
  const effBall = sql`coalesce(${userMeta.ballOverride}, ${items.ball})`;
  if (f.q) {
    const term = `%${f.q.replace(/[%_]/g, (c) => `\\${c}`)}%`;
    const num = /^#?(\d+)$/.exec(f.q)?.[1];
    conds.push(
      or(
        ilike(items.title, term),
        ilike(items.repoFullName, term),
        ilike(userMeta.notes, term),
        num ? eq(items.number, Number(num)) : undefined,
        sql`exists (select 1 from unnest(${userMeta.tags}) t where t ilike ${term})`,
      ),
    );
  }
  if (f.kind?.length) conds.push(inArray(items.kind, f.kind));
  if (f.state?.length) conds.push(inArray(items.state, f.state));
  if (f.stage?.length)
    conds.push(
      sql`${effStage} in (${sql.join(
        f.stage.map((s) => sql`${s}`),
        sql`, `,
      )})`,
    );
  if (f.ball?.length)
    conds.push(
      sql`${effBall} in (${sql.join(
        f.ball.map((s) => sql`${s}`),
        sql`, `,
      )})`,
    );
  if (f.ci?.length) conds.push(inArray(items.ciState, f.ci));
  if (f.priority?.length) conds.push(inArray(userMeta.priority, f.priority));
  if (f.repo?.length)
    conds.push(
      sql`lower(${items.repoFullName}) in (${sql.join(
        f.repo.map((r) => sql`${r.toLowerCase()}`),
        sql`, `,
      )})`,
    );
  if (f.label?.length)
    conds.push(
      sql`exists (select 1 from jsonb_array_elements(${items.labels}) l where l->>'name' in (${sql.join(
        f.label.map((l) => sql`${l}`),
        sql`, `,
      )}))`,
    );
  if (f.tag?.length)
    conds.push(
      sql`${userMeta.tags} && ${sql`array[${sql.join(
        f.tag.map((t) => sql`${t}`),
        sql`, `,
      )}]::text[]`}`,
    );
  if (f.relation?.length)
    conds.push(
      sql`${items.myRelation} && ${sql`array[${sql.join(
        f.relation.map((t) => sql`${t}`),
        sql`, `,
      )}]::text[]`}`,
    );
  if (f.source?.length) conds.push(inArray(items.source, f.source));
  if (f.program) conds.push(sql`lower(${repoMeta.programTag}) = ${f.program.toLowerCase()}`);
  if (f.archived === "exclude") conds.push(sql`coalesce(${userMeta.archived}, false) = false`);
  else if (f.archived === "only") conds.push(eq(userMeta.archived, true));
  conds.push(eq(items.isGone, false));
  const defined = conds.filter((c): c is SQL => c !== undefined);
  return defined.length ? and(...defined) : undefined;
}

function orderFor(f: ItemFilter): SQL[] {
  const dir = f.dir === "asc" ? asc : desc;
  const nullsLast = (e: SQL) =>
    f.dir === "asc" ? sql`${e} asc nulls last` : sql`${e} desc nulls last`;
  switch (f.sort) {
    case "attention":
      return [dir(items.attentionScore), desc(items.ghUpdatedAt)];
    case "created":
      return [nullsLast(sql`${items.ghCreatedAt}`)];
    case "repo":
      return [dir(sql`lower(${items.repoFullName})`), desc(items.number)];
    case "title":
      return [dir(sql`lower(${items.title})`)];
    case "priority":
      return [
        sql`${userMeta.priority} ${f.dir === "asc" ? sql`desc` : sql`asc`} nulls last`,
        desc(items.ghUpdatedAt),
      ];
    case "stage":
      return [
        dir(sql`coalesce(${userMeta.personalStage}, ${items.stage})`),
        desc(items.ghUpdatedAt),
      ];
    case "activity":
      return [nullsLast(sql`coalesce(${items.lastActivityAt}, ${items.ghUpdatedAt})`)];
    default:
      return [nullsLast(sql`coalesce(${items.ghUpdatedAt}, ${items.createdAt})`)];
  }
}

export async function listItems(
  db: Executor,
  f: ItemFilter,
  now = new Date(),
): Promise<{ rows: ItemRow[]; total: number }> {
  const where = whereFor(f);
  const base = db
    .select({ item: items, meta: userMeta, programTag: repoMeta.programTag })
    .from(items)
    .leftJoin(userMeta, eq(userMeta.itemId, items.id))
    .leftJoin(repoMeta, sql`${repoMeta.repoFullName} = lower(${items.repoFullName})`)
    .where(where);
  const [rows, countRows] = await Promise.all([
    base
      .orderBy(...orderFor(f))
      .limit(f.pageSize)
      .offset((f.page - 1) * f.pageSize),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(items)
      .leftJoin(userMeta, eq(userMeta.itemId, items.id))
      .leftJoin(repoMeta, sql`${repoMeta.repoFullName} = lower(${items.repoFullName})`)
      .where(where),
  ]);
  const reviewerMap = await reviewersFor(
    db,
    rows.map((r) => r.item.id),
  );
  let out = rows.map((r) =>
    toItemRow(
      r.item,
      r.meta,
      { programTag: r.programTag, reviewers: reviewerMap.get(r.item.id) },
      now,
    ),
  );
  if (f.sort === "attention")
    out = out.sort((a, b) =>
      f.dir === "asc" ? a.attentionScore - b.attentionScore : b.attentionScore - a.attentionScore,
    );
  return { rows: out, total: countRows[0]?.n ?? 0 };
}

export async function facetValues(
  db: Executor,
): Promise<{ repos: string[]; labels: string[]; tags: string[]; programs: string[] }> {
  const [repoRows, labelRows, tagRows, programRows] = await Promise.all([
    db.selectDistinct({ v: items.repoFullName }).from(items).orderBy(asc(items.repoFullName)),
    db.execute<{ v: string }>(
      sql`select distinct l->>'name' as v from items, jsonb_array_elements(labels) l order by 1 limit 300`,
    ),
    db.execute<{ v: string }>(sql`select distinct unnest(tags) as v from user_meta order by 1`),
    db
      .selectDistinct({ v: repoMeta.programTag })
      .from(repoMeta)
      .where(isNotNull(repoMeta.programTag)),
  ]);
  const rowsOf = <T>(r: unknown): T[] =>
    Array.isArray(r) ? (r as T[]) : ((r as { rows: T[] }).rows ?? []);
  return {
    repos: repoRows.map((r) => r.v),
    labels: rowsOf<{ v: string }>(labelRows).map((r) => r.v),
    tags: rowsOf<{ v: string }>(tagRows).map((r) => r.v),
    programs: programRows.map((r) => r.v).filter((v): v is string => !!v),
  };
}

export interface TimelineEntry {
  id: string;
  kind: "event" | "comment" | "review";
  type: string;
  actor: string | null;
  actorAvatarUrl: string | null;
  at: string;
  body: string | null;
  url: string | null;
  isMaintainer: boolean;
  isBot: boolean;
  isMine: boolean;
  payload: Record<string, unknown>;
}

export interface ItemDetail {
  row: ItemRow;
  body: string | null;
  repo: {
    fullName: string;
    url: string;
    description: string | null;
    language: string | null;
    stars: number;
    myRole: string;
  } | null;
  pr: {
    baseRef: string | null;
    headRef: string | null;
    changedFiles: number | null;
    mergeable: string | null;
    reviewDecision: string | null;
    reviewRequests: { login: string; kind: string }[];
    unresolvedThreads: number;
  } | null;
  checks: {
    id: string;
    name: string;
    status: string;
    conclusion: string | null;
    url: string | null;
    completedAt: string | null;
  }[];
  links: {
    id: string;
    linkedItemId: string | null;
    url: string;
    title: string | null;
    number: number | null;
    repo: string | null;
    kind: string | null;
    state: string | null;
    relation: string;
    source: string;
  }[];
  timeline: TimelineEntry[];
  assignees: string[];
  milestone: string | null;
  hydrateError: string | null;
  isGone: boolean;
}

export async function getItemDetail(
  db: Executor,
  id: string,
  me: string,
  now = new Date(),
): Promise<ItemDetail | null> {
  const rows = await db
    .select({ item: items, meta: userMeta, programTag: repoMeta.programTag, repo: repos })
    .from(items)
    .leftJoin(userMeta, eq(userMeta.itemId, items.id))
    .leftJoin(repoMeta, sql`${repoMeta.repoFullName} = lower(${items.repoFullName})`)
    .leftJoin(repos, eq(repos.id, items.repoId))
    .where(eq(items.id, id))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  const [reviewerMap, checkRows, linkRows, commentRows, reviewRows, eventRows] = await Promise.all([
    reviewersFor(db, [id]),
    db.select().from(checkRuns).where(eq(checkRuns.itemId, id)).orderBy(asc(checkRuns.name)),
    db.select().from(itemLinks).where(eq(itemLinks.itemId, id)),
    db.select().from(comments).where(eq(comments.itemId, id)).orderBy(asc(comments.createdAt)),
    db.select().from(reviews).where(eq(reviews.itemId, id)).orderBy(asc(reviews.submittedAt)),
    db
      .select()
      .from(itemEvents)
      .where(
        and(
          eq(itemEvents.itemId, id),
          ne(itemEvents.type, "new_comment"),
          ne(itemEvents.type, "maintainer_replied"),
          ne(itemEvents.type, "mentioned"),
        ),
      )
      .orderBy(asc(itemEvents.occurredAt)),
  ]);
  // Reverse links: other items pointing at this one.
  const reverse = await db
    .select({
      link: itemLinks,
      title: items.title,
      number: items.number,
      repo: items.repoFullName,
      kind: items.kind,
      state: items.state,
      url: items.url,
    })
    .from(itemLinks)
    .innerJoin(items, eq(items.id, itemLinks.itemId))
    .where(eq(itemLinks.linkedItemId, id));

  const i = r.item;
  const lowerMe = me.toLowerCase();
  const timeline: TimelineEntry[] = [
    ...commentRows.map((c) => ({
      id: c.id,
      kind: "comment" as const,
      type: "comment",
      actor: c.author,
      actorAvatarUrl: c.authorAvatarUrl,
      at: c.createdAt.toISOString(),
      body: c.body,
      url: c.url,
      isMaintainer: c.isMaintainer,
      isBot: c.isBot,
      isMine: c.isMine,
      payload: {},
    })),
    ...reviewRows
      .filter((v) => v.state !== "PENDING")
      .map((v) => ({
        id: v.id,
        kind: "review" as const,
        type: v.state,
        actor: v.reviewer,
        actorAvatarUrl: v.reviewerAvatarUrl,
        at: (v.submittedAt ?? i.ghUpdatedAt ?? now).toISOString(),
        body: v.body,
        url: v.url,
        isMaintainer: ["OWNER", "MEMBER", "COLLABORATOR"].includes(v.reviewerAssociation ?? ""),
        isBot: false,
        isMine: v.reviewer.toLowerCase() === lowerMe,
        payload: {},
      })),
    ...eventRows
      .filter((e) => !["approved", "changes_requested", "reviewed"].includes(e.type))
      .map((e) => ({
        id: `e${e.id}`,
        kind: "event" as const,
        type: e.type,
        actor: e.actor,
        actorAvatarUrl: null,
        at: e.occurredAt.toISOString(),
        body: null,
        url: null,
        isMaintainer: false,
        isBot: false,
        isMine: !!e.actor && e.actor.toLowerCase() === lowerMe,
        payload: e.payload,
      })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return {
    row: toItemRow(i, r.meta, { programTag: r.programTag, reviewers: reviewerMap.get(id) }, now),
    body: i.body,
    repo: r.repo
      ? {
          fullName: r.repo.fullName,
          url: r.repo.url,
          description: r.repo.description,
          language: r.repo.language,
          stars: r.repo.stars,
          myRole: r.repo.myRole,
        }
      : null,
    pr:
      i.kind === "pr"
        ? {
            baseRef: i.baseRef,
            headRef: i.headRef,
            changedFiles: i.changedFiles,
            mergeable: i.mergeable,
            reviewDecision: i.reviewDecision,
            reviewRequests: i.reviewRequests,
            unresolvedThreads: i.unresolvedThreads,
          }
        : null,
    checks: checkRows.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      conclusion: c.conclusion,
      url: c.url,
      completedAt: iso(c.completedAt),
    })),
    links: [
      ...linkRows.map((l) => ({
        id: l.id,
        linkedItemId: l.linkedItemId,
        url: l.linkedUrl,
        title: l.linkedTitle,
        number: l.linkedNumber,
        repo: l.linkedRepo,
        kind: l.linkedKind,
        state: l.linkedState,
        relation: l.relation,
        source: l.source,
      })),
      ...reverse
        .filter((x) => !linkRows.some((l) => l.linkedItemId === x.link.itemId))
        .map((x) => ({
          id: `rev-${x.link.id}`,
          linkedItemId: x.link.itemId,
          url: x.url ?? "",
          title: x.title,
          number: x.number,
          repo: x.repo,
          kind: x.kind,
          state: x.state,
          relation:
            x.link.relation === "closes"
              ? "closed_by"
              : x.link.relation === "closed_by"
                ? "closes"
                : x.link.relation,
          source: x.link.source,
        })),
    ],
    timeline,
    assignees: i.assignees,
    milestone: i.milestone,
    hydrateError: i.hydrateError,
    isGone: i.isGone,
  };
}

/* ───────────────────────── Today ───────────────────────── */

export interface ActivityEntry {
  id: number;
  type: string;
  actor: string | null;
  at: string;
  payload: Record<string, unknown>;
  unread: boolean;
  item: {
    id: string;
    title: string;
    repoFullName: string;
    number: number | null;
    kind: string;
    state: string;
  };
}

export async function recentActivity(
  db: Executor,
  opts: { limit?: number; since?: Date } = {},
): Promise<ActivityEntry[]> {
  const rows = await db
    .select({
      e: itemEvents,
      title: items.title,
      repo: items.repoFullName,
      number: items.number,
      kind: items.kind,
      state: items.state,
    })
    .from(itemEvents)
    .innerJoin(items, eq(items.id, itemEvents.itemId))
    .leftJoin(repoMeta, sql`${repoMeta.repoFullName} = lower(${items.repoFullName})`)
    .where(
      and(
        ne(itemEvents.type, "discovered"),
        sql`coalesce(${repoMeta.muted}, false) = false`,
        opts.since ? gt(itemEvents.occurredAt, opts.since) : undefined,
      ),
    )
    .orderBy(desc(itemEvents.occurredAt))
    .limit(opts.limit ?? 30);
  return rows.map((r) => ({
    id: r.e.id,
    type: r.e.type,
    actor: r.e.actor,
    at: r.e.occurredAt.toISOString(),
    payload: r.e.payload,
    unread: r.e.readAt == null,
    item: {
      id: r.e.itemId,
      title: r.title,
      repoFullName: r.repo,
      number: r.number,
      kind: r.kind,
      state: r.state,
    },
  }));
}

export interface TodayData {
  needsYou: ItemRow[];
  waiting: ItemRow[];
  snoozedCount: number;
  activity: ActivityEntry[];
  stats: {
    needsYou: number;
    waiting: number;
    mergedThisWeek: number;
    openPrs: number;
    openIssues: number;
    mergedTotal: number;
    unreadInbox: number;
    newSinceLastVisit: number;
  };
  lastVisitAt: string | null;
}

export async function getToday(
  db: Executor,
  opts: { now?: Date; lastVisitAt?: Date | null } = {},
): Promise<TodayData> {
  const now = opts.now ?? new Date();
  const rows = await db
    .select({ item: items, meta: userMeta, programTag: repoMeta.programTag, muted: repoMeta.muted })
    .from(items)
    .leftJoin(userMeta, eq(userMeta.itemId, items.id))
    .leftJoin(repoMeta, sql`${repoMeta.repoFullName} = lower(${items.repoFullName})`)
    .where(
      and(
        eq(items.isGone, false),
        sql`coalesce(${userMeta.archived}, false) = false`,
        or(eq(items.state, "open"), isNotNull(userMeta.dueAt)),
      ),
    )
    .limit(2000);
  const reviewerMap = await reviewersFor(
    db,
    rows.map((r) => r.item.id),
  );
  const all = rows
    .filter((r) => !r.muted)
    .map((r) =>
      toItemRow(
        r.item,
        r.meta,
        { programTag: r.programTag, reviewers: reviewerMap.get(r.item.id) },
        now,
      ),
    );

  const snoozed = (row: ItemRow) =>
    !!row.meta.snoozedUntil && Date.parse(row.meta.snoozedUntil) > now.getTime();
  const needs = all
    .filter(
      (r) =>
        !snoozed(r) &&
        (needsYou(r.attentionReasons) ||
          (r.state === "open" && r.effectiveBall === "you" && r.source !== "planned")),
    )
    .sort(
      (a, b) =>
        b.attentionScore - a.attentionScore ||
        (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""),
    );
  const needIds = new Set(needs.map((r) => r.id));
  const waiting = all
    .filter(
      (r) =>
        r.state === "open" &&
        !needIds.has(r.id) &&
        !snoozed(r) &&
        (r.effectiveBall === "maintainer" || r.effectiveBall === "ci"),
    )
    .sort((a, b) => (a.lastActivityAt ?? "").localeCompare(b.lastActivityAt ?? ""));

  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const [counts] = await db
    .select({
      mergedThisWeek: sql<number>`count(*) filter (where ${items.state} = 'merged' and ${items.mergedAt} > ${weekAgo} and 'author' = any(${items.myRelation}))::int`,
      openPrs: sql<number>`count(*) filter (where ${items.state} = 'open' and ${items.kind} = 'pr' and 'author' = any(${items.myRelation}))::int`,
      openIssues: sql<number>`count(*) filter (where ${items.state} = 'open' and ${items.kind} <> 'pr')::int`,
      mergedTotal: sql<number>`count(*) filter (where ${items.state} = 'merged' and 'author' = any(${items.myRelation}))::int`,
    })
    .from(items)
    .where(eq(items.isGone, false));
  const [unreadN] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(eq(notifications.unread, true));
  const [unreadE] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(itemEvents)
    .where(and(sql`${itemEvents.readAt} is null`, ne(itemEvents.priority, "low")));

  const activity = await recentActivity(db, { limit: 30 });
  const since = opts.lastVisitAt ?? null;
  const newSince = since ? activity.filter((a) => Date.parse(a.at) > since.getTime()).length : 0;

  return {
    needsYou: needs,
    waiting,
    snoozedCount: all.filter(snoozed).length,
    activity,
    stats: {
      needsYou: needs.length,
      waiting: waiting.length,
      mergedThisWeek: counts?.mergedThisWeek ?? 0,
      openPrs: counts?.openPrs ?? 0,
      openIssues: counts?.openIssues ?? 0,
      mergedTotal: counts?.mergedTotal ?? 0,
      unreadInbox: (unreadN?.n ?? 0) + (unreadE?.n ?? 0),
      newSinceLastVisit: newSince,
    },
    lastVisitAt: since ? since.toISOString() : null,
  };
}

/** Lightweight search for the command palette. */
export async function searchItems(
  db: Executor,
  q: string,
  limit = 12,
): Promise<
  {
    id: string;
    title: string;
    repoFullName: string;
    number: number | null;
    kind: string;
    state: string;
    stage: string;
  }[]
> {
  const term = `%${q.replace(/[%_]/g, (c) => `\\${c}`)}%`;
  const num = /^#?(\d+)$/.exec(q.trim())?.[1];
  return db
    .select({
      id: items.id,
      title: items.title,
      repoFullName: items.repoFullName,
      number: items.number,
      kind: items.kind,
      state: items.state,
      stage: items.stage,
    })
    .from(items)
    .where(
      and(
        eq(items.isGone, false),
        or(
          ilike(items.title, term),
          ilike(items.repoFullName, term),
          num ? eq(items.number, Number(num)) : undefined,
        ),
      ),
    )
    .orderBy(sql`case when ${items.state} = 'open' then 0 else 1 end`, desc(items.ghUpdatedAt))
    .limit(limit);
}
