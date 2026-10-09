import { and, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
import type { Db, Executor } from "../db/client";
import { checkRuns, comments, itemEvents, itemLinks, items, repos, reviews } from "../db/schema";
import {
  deriveAll,
  diffSnapshots,
  isBotLogin,
  isMaintainerAssociation,
  sameLogin,
  type StaleThresholds,
} from "../derive";
import type { ItemSnapshot, Relation, RepoSnapshot } from "../types";

export interface PersistOptions {
  me: string;
  now?: Date;
  stale?: StaleThresholds;
  /** Relations implied by the discovery query that found this item. */
  discoveredRelations?: readonly Relation[];
  /** Explicit source for items added by URL. */
  source?: "github" | "manual";
  /** First import: write events as already-read so the inbox isn't flooded. */
  initialImport?: boolean;
}

export interface PersistResult {
  itemId: string;
  created: boolean;
  eventsCreated: number;
}

export async function upsertRepo(
  tx: Executor,
  r: RepoSnapshot,
  me: string,
  now: Date,
): Promise<string> {
  const lower = r.fullName.toLowerCase();
  const existingByName = await tx
    .select({ id: repos.id })
    .from(repos)
    .where(sql`lower(${repos.fullName}) = ${lower}`)
    .limit(1);
  const clash = existingByName[0];
  if (clash && clash.id !== r.id) {
    if (clash.id.startsWith("repo:")) {
      // Placeholder repo (from a planned item) → adopt the real node id.
      await tx.update(items).set({ repoId: null }).where(eq(items.repoId, clash.id));
      await tx.delete(repos).where(eq(repos.id, clash.id));
      await tx
        .insert(repos)
        .values(repoValues(r, me, now))
        .onConflictDoNothing();
      await tx
        .update(items)
        .set({ repoId: r.id })
        .where(sql`lower(${items.repoFullName}) = ${lower} and ${items.repoId} is null`);
    } else {
      // Another repo previously held this name (rename/transfer). Free the name.
      await tx
        .update(repos)
        .set({ fullName: `${clash.id}~renamed` })
        .where(eq(repos.id, clash.id));
    }
  }
  const values = repoValues(r, me, now);
  const { id: _id, createdAt: _c, ...update } = values;
  const prior = await tx
    .select({ fullName: repos.fullName })
    .from(repos)
    .where(eq(repos.id, r.id))
    .limit(1);
  await tx.insert(repos).values(values).onConflictDoUpdate({ target: repos.id, set: update });
  if (prior[0] && prior[0].fullName !== r.fullName) {
    // Repo renamed: keep item slugs in step.
    await tx.update(items).set({ repoFullName: r.fullName }).where(eq(items.repoId, r.id));
  }
  return r.id;
}

/** Find a repo by slug or create a placeholder (`repo:<slug>`) for items that have no GitHub data yet. */
export async function ensureRepoStub(tx: Executor, fullName: string): Promise<string> {
  const [owner, name] = fullName.split("/") as [string, string];
  const lower = fullName.toLowerCase();
  const found = await tx
    .select({ id: repos.id })
    .from(repos)
    .where(sql`lower(${repos.fullName}) = ${lower}`)
    .limit(1);
  if (found[0]) return found[0].id;
  const id = `repo:${lower}`;
  await tx
    .insert(repos)
    .values({ id, owner, name, fullName, url: `https://github.com/${fullName}`, myRole: "none" })
    .onConflictDoNothing();
  return id;
}

function repoValues(r: RepoSnapshot, me: string, now: Date) {
  const perm = r.viewerPermission;
  const myRole =
    sameLogin(r.owner, me) || perm === "ADMIN" || perm === "MAINTAIN" || perm === "WRITE"
      ? ("maintainer" as const)
      : ("contributor" as const);
  return {
    id: r.id,
    owner: r.owner,
    name: r.name,
    fullName: r.fullName,
    description: r.description,
    stars: r.stars,
    language: r.language,
    languageColor: r.languageColor,
    defaultBranch: r.defaultBranch,
    isFork: r.isFork,
    isArchived: r.isArchived,
    isPrivate: r.isPrivate,
    myRole,
    url: r.url,
    ownerAvatarUrl: r.ownerAvatarUrl,
    lastSyncedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Idempotently write one hydrated snapshot: repo, item, reviews, checks, comments, links and the
 * change events produced by diffing against the previous snapshot. Never touches `user_meta`.
 */
export async function persistSnapshot(
  db: Db,
  s: ItemSnapshot,
  opts: PersistOptions,
): Promise<PersistResult> {
  const now = opts.now ?? new Date();
  return db.transaction(async (tx) => {
    await upsertRepo(tx, s.repo, opts.me, now);

    const existingRows = await tx
      .select({
        id: items.id,
        rawSnapshot: items.rawSnapshot,
        isStale: items.isStale,
        source: items.source,
        myRelation: items.myRelation,
      })
      .from(items)
      .where(eq(items.id, s.id))
      .limit(1);
    const existing = existingRows[0];

    // Same repo+number held by a different node id (transferred/recreated): retire the old row.
    await tx
      .update(items)
      .set({ number: null, isGone: true, updatedAt: now })
      .where(
        and(
          sql`lower(${items.repoFullName}) = ${s.repo.fullName.toLowerCase()}`,
          eq(items.number, s.number),
          ne(items.id, s.id),
        ),
      );

    const relationsIn = new Set<Relation>([
      ...((existing?.myRelation ?? []) as Relation[]),
      ...(opts.discoveredRelations ?? []),
    ]);
    const derived = deriveAll(s, { me: opts.me, now, stale: opts.stale }, [...relationsIn]);
    const source =
      existing?.source === "manual" && !opts.discoveredRelations?.length
        ? "manual"
        : (opts.source ??
          (existing?.source === "planned" ? "github" : (existing?.source ?? "github")));

    const pr = s.pr;
    const values = {
      id: s.id,
      repoId: s.repo.id,
      repoFullName: s.repo.fullName,
      kind: s.kind,
      number: s.number,
      title: s.title,
      body: s.body,
      state: s.state,
      stateReason: s.stateReason,
      isDraft: s.isDraft,
      isLocked: s.isLocked,
      author: s.author,
      authorAvatarUrl: s.authorAvatarUrl,
      authorAssociation: s.authorAssociation,
      ghCreatedAt: new Date(s.createdAt),
      ghUpdatedAt: new Date(s.updatedAt),
      closedAt: s.closedAt ? new Date(s.closedAt) : null,
      mergedAt: s.mergedAt ? new Date(s.mergedAt) : null,
      mergedBy: s.mergedBy,
      labels: s.labels,
      assignees: s.assignees,
      milestone: s.milestone,
      commentsCount: s.commentsCount,
      myRelation: derived.relations,
      url: s.url,
      source,
      baseRef: pr?.baseRef ?? null,
      headRef: pr?.headRef ?? null,
      additions: pr?.additions ?? null,
      deletions: pr?.deletions ?? null,
      changedFiles: pr?.changedFiles ?? null,
      mergeable: pr?.mergeable ?? null,
      mergeStateStatus: pr?.mergeStateStatus ?? null,
      reviewDecision: pr?.reviewDecision ?? null,
      reviewRequests: pr?.reviewRequests ?? [],
      unresolvedThreads: pr?.unresolvedThreads ?? 0,
      ciState: derived.ciState,
      headSha: pr?.headSha ?? null,
      stage: derived.stage,
      ball: derived.ball,
      attentionScore: derived.baseScore,
      attentionReasons: derived.reasons,
      nextAction: derived.nextAction,
      lastActivityAt: derived.lastActivityAt,
      lastMaintainerActivityAt: derived.lastMaintainerActivityAt,
      lastMyActivityAt: derived.lastMyActivityAt,
      firstResponseAt: derived.firstResponseAt,
      isStale: derived.isStale,
      rawSnapshot: s,
      lastHydratedAt: now,
      hydrateError: null,
      isGone: false,
      updatedAt: now,
    };
    const { id: _id, ...update } = values;
    await tx.insert(items).values(values).onConflictDoUpdate({ target: items.id, set: update });

    // Reviews: upsert by node id (history preserved).
    if (pr && pr.reviews.length) {
      await tx
        .insert(reviews)
        .values(
          pr.reviews.map((r) => ({
            id: r.id,
            itemId: s.id,
            reviewer: r.author,
            reviewerAvatarUrl: r.authorAvatarUrl,
            reviewerAssociation: r.authorAssociation,
            state: r.state,
            submittedAt: r.submittedAt ? new Date(r.submittedAt) : null,
            body: r.body,
            url: r.url,
          })),
        )
        .onConflictDoUpdate({
          target: reviews.id,
          set: {
            state: sql`excluded.state`,
            body: sql`excluded.body`,
            submittedAt: sql`excluded.submitted_at`,
          },
        });
    }

    // Checks reflect the current head commit only: replace.
    await tx.delete(checkRuns).where(eq(checkRuns.itemId, s.id));
    if (pr && pr.checks.length) {
      await tx
        .insert(checkRuns)
        .values(
          pr.checks.map((c) => ({
            id: `${s.id}:${c.id}`,
            itemId: s.id,
            name: c.name,
            kind: c.kind,
            status: c.status,
            conclusion: c.conclusion,
            url: c.url,
            completedAt: c.completedAt ? new Date(c.completedAt) : null,
          })),
        )
        .onConflictDoNothing();
    }

    // Comments: upsert (older comments beyond the hydrated window are kept).
    if (s.comments.length) {
      await tx
        .insert(comments)
        .values(
          s.comments.map((c) => ({
            id: c.id,
            itemId: s.id,
            author: c.author,
            authorAvatarUrl: c.authorAvatarUrl,
            authorAssociation: c.authorAssociation,
            body: c.body,
            url: c.url,
            createdAt: new Date(c.createdAt),
            isMaintainer: isMaintainerAssociation(c.authorAssociation) && !c.isBot,
            isBot: c.isBot || isBotLogin(c.author),
            isMine: sameLogin(c.author, opts.me),
          })),
        )
        .onConflictDoUpdate({ target: comments.id, set: { body: sql`excluded.body` } });
    }

    // Automatic issue ↔ PR links from closing references.
    const refs =
      s.kind === "pr"
        ? (pr?.closingIssues ?? []).map((r) => ({ ...r, relation: "closes" as const }))
        : s.closedByPrs.map((r) => ({ ...r, relation: "closed_by" as const }));
    if (refs.length) {
      const known = await tx
        .select({ id: items.id })
        .from(items)
        .where(
          inArray(
            items.id,
            refs.map((r) => r.id),
          ),
        );
      const knownIds = new Set(known.map((k) => k.id));
      await tx
        .insert(itemLinks)
        .values(
          refs.map((r) => ({
            itemId: s.id,
            linkedItemId: knownIds.has(r.id) ? r.id : null,
            linkedUrl: r.url,
            linkedTitle: r.title,
            linkedNumber: r.number,
            linkedRepo: r.repo,
            linkedKind: r.kind,
            linkedState: r.state,
            relation: r.relation,
            source: "auto",
          })),
        )
        .onConflictDoUpdate({
          target: [itemLinks.itemId, itemLinks.linkedUrl],
          set: {
            linkedTitle: sql`excluded.linked_title`,
            linkedState: sql`excluded.linked_state`,
            linkedItemId: sql`coalesce(excluded.linked_item_id, ${itemLinks.linkedItemId})`,
          },
        });
    }
    const keepUrls = refs.map((r) => r.url);
    await tx
      .delete(itemLinks)
      .where(
        and(
          eq(itemLinks.itemId, s.id),
          eq(itemLinks.source, "auto"),
          keepUrls.length ? notInArray(itemLinks.linkedUrl, keepUrls) : sql`true`,
        ),
      );
    // Back-fill links that point at this item from items synced earlier.
    await tx
      .update(itemLinks)
      .set({ linkedItemId: s.id, linkedState: s.state })
      .where(eq(itemLinks.linkedUrl, s.url));

    // Change events
    const drafts = diffSnapshots(existing?.rawSnapshot ?? null, s, {
      me: opts.me,
      now,
      wasStale: existing?.isStale ?? false,
      isStale: derived.isStale,
    });
    let eventsCreated = 0;
    if (drafts.length) {
      const inserted = await tx
        .insert(itemEvents)
        .values(
          drafts.map((d) => ({
            itemId: s.id,
            type: d.type,
            actor: d.actor,
            payload: d.payload,
            occurredAt: d.occurredAt,
            priority: d.priority,
            dedupeKey: d.dedupeKey,
            readAt:
              opts.initialImport || d.type === "discovered" || d.priority === "low" ? now : null,
            dispatchedAt: opts.initialImport || d.priority !== "high" ? now : null,
          })),
        )
        .onConflictDoNothing({ target: itemEvents.dedupeKey })
        .returning({ id: itemEvents.id });
      eventsCreated = inserted.length;
    }

    return { itemId: s.id, created: !existing, eventsCreated };
  });
}

/** Mark an item as no longer resolvable on GitHub (deleted, transferred or access revoked). */
export async function markGone(
  db: Db,
  itemId: string,
  reason: string,
  now = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(items)
      .set({ isGone: true, hydrateError: reason, lastHydratedAt: now, updatedAt: now })
      .where(and(eq(items.id, itemId), eq(items.isGone, false)))
      .returning({ id: items.id });
    if (updated.length) {
      await tx
        .insert(itemEvents)
        .values({
          itemId,
          type: "gone",
          payload: { reason },
          occurredAt: now,
          priority: "normal",
          dedupeKey: `${itemId}:gone:${now.toISOString().slice(0, 10)}`,
          dispatchedAt: now,
        })
        .onConflictDoNothing();
    }
  });
}
