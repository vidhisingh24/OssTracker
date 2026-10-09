import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "../client";
import { itemLinks, items, repoMeta, savedViews, userMeta } from "../schema";
import { BALLS, PRIORITIES, STAGES, type ItemMeta } from "../../types";
import { ensureRepoStub } from "../../sync/persist";
import { metaFromRecord } from "./items";

const isoDate = z.iso.datetime({ offset: true }).or(z.iso.date()).nullable();

export const metaPatchSchema = z
  .object({
    personalStage: z.enum(STAGES).nullable(),
    priority: z.enum(PRIORITIES).nullable(),
    tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(30),
    notes: z.string().max(50_000).nullable(),
    dueAt: isoDate,
    remindAt: isoDate,
    snoozedUntil: isoDate,
    pinned: z.boolean(),
    archived: z.boolean(),
    ballOverride: z.enum(BALLS).nullable(),
    waitingOn: z.string().max(200).nullable(),
    lastViewedAt: isoDate,
  })
  .partial()
  .strict();
export type MetaPatch = z.infer<typeof metaPatchSchema>;

const toDate = (v: string | null | undefined) =>
  v === undefined ? undefined : v === null ? null : new Date(v);

export async function updateItemMeta(
  db: Executor,
  itemId: string,
  patch: MetaPatch,
): Promise<ItemMeta | null> {
  const exists = await db.select({ id: items.id }).from(items).where(eq(items.id, itemId)).limit(1);
  if (!exists[0]) return null;
  const values = {
    ...(patch.personalStage !== undefined && { personalStage: patch.personalStage }),
    ...(patch.priority !== undefined && { priority: patch.priority }),
    ...(patch.tags !== undefined && { tags: [...new Set(patch.tags)] }),
    ...(patch.notes !== undefined && { notes: patch.notes }),
    ...(patch.dueAt !== undefined && { dueAt: toDate(patch.dueAt) }),
    ...(patch.remindAt !== undefined && { remindAt: toDate(patch.remindAt), remindedAt: null }),
    ...(patch.snoozedUntil !== undefined && { snoozedUntil: toDate(patch.snoozedUntil) }),
    ...(patch.pinned !== undefined && { pinned: patch.pinned }),
    ...(patch.archived !== undefined && { archived: patch.archived }),
    ...(patch.ballOverride !== undefined && { ballOverride: patch.ballOverride }),
    ...(patch.waitingOn !== undefined && { waitingOn: patch.waitingOn }),
    ...(patch.lastViewedAt !== undefined && { lastViewedAt: toDate(patch.lastViewedAt) }),
    updatedAt: new Date(),
  };
  const [row] = await db
    .insert(userMeta)
    .values({ itemId, ...values })
    .onConflictDoUpdate({ target: userMeta.itemId, set: values })
    .returning();
  return metaFromRecord(row);
}

export const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(1000),
  op: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("addTags"),
      tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).min(1),
    }),
    z.object({
      type: z.literal("removeTags"),
      tags: z.array(z.string().trim().toLowerCase().min(1)).min(1),
    }),
    z.object({ type: z.literal("priority"), value: z.enum(PRIORITIES).nullable() }),
    z.object({ type: z.literal("archive"), value: z.boolean() }),
    z.object({ type: z.literal("snooze"), until: isoDate }),
    z.object({ type: z.literal("pin"), value: z.boolean() }),
    z.object({ type: z.literal("stage"), value: z.enum(STAGES).nullable() }),
  ]),
});
export type BulkInput = z.infer<typeof bulkSchema>;

export async function bulkUpdate(db: Executor, input: BulkInput): Promise<number> {
  const existing = await db
    .select({ id: items.id })
    .from(items)
    .where(inArray(items.id, input.ids));
  const ids = existing.map((e) => e.id);
  if (!ids.length) return 0;
  await db
    .insert(userMeta)
    .values(ids.map((itemId) => ({ itemId })))
    .onConflictDoNothing();
  const now = new Date();
  const op = input.op;
  const where = inArray(userMeta.itemId, ids);
  switch (op.type) {
    case "addTags":
      await db
        .update(userMeta)
        .set({
          tags: sql`(select array(select distinct unnest(${userMeta.tags} || ${sql`array[${sql.join(
            op.tags.map((t) => sql`${t}`),
            sql`, `,
          )}]::text[]`})))`,
          updatedAt: now,
        })
        .where(where);
      break;
    case "removeTags":
      await db
        .update(userMeta)
        .set({
          tags: sql`(select coalesce(array_agg(t), '{}') from unnest(${userMeta.tags}) t where t <> all(${sql`array[${sql.join(
            op.tags.map((t) => sql`${t}`),
            sql`, `,
          )}]::text[]`}))`,
          updatedAt: now,
        })
        .where(where);
      break;
    case "priority":
      await db.update(userMeta).set({ priority: op.value, updatedAt: now }).where(where);
      break;
    case "archive":
      await db.update(userMeta).set({ archived: op.value, updatedAt: now }).where(where);
      break;
    case "snooze":
      await db
        .update(userMeta)
        .set({ snoozedUntil: op.until ? new Date(op.until) : null, updatedAt: now })
        .where(where);
      break;
    case "pin":
      await db.update(userMeta).set({ pinned: op.value, updatedAt: now }).where(where);
      break;
    case "stage":
      await db.update(userMeta).set({ personalStage: op.value, updatedAt: now }).where(where);
      break;
  }
  return ids.length;
}

/* ───────────── Planned items ───────────── */

const repoSlug = z
  .string()
  .trim()
  .regex(/^[\w.-]+\/[\w.-]+$/, "use owner/name");

export const plannedSchema = z.object({
  repo: repoSlug,
  title: z.string().trim().min(1).max(300),
  url: z.url().optional().nullable(),
  notes: z.string().max(20_000).optional().nullable(),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20).optional(),
  priority: z.enum(PRIORITIES).optional().nullable(),
});

export async function createPlanned(
  db: Executor,
  input: z.infer<typeof plannedSchema>,
): Promise<string> {
  const repoId = await ensureRepoStub(db, input.repo);
  const id = `planned_${randomUUID()}`;
  const now = new Date();
  await db.insert(items).values({
    id,
    repoId,
    repoFullName: input.repo,
    kind: "issue",
    title: input.title,
    url: input.url ?? null,
    source: "planned",
    stage: "discovered",
    ball: "you",
    nextAction: "Planned — open an issue or comment to claim it",
    ghCreatedAt: now,
    lastActivityAt: now,
  });
  await db.insert(userMeta).values({
    itemId: id,
    notes: input.notes ?? null,
    tags: input.tags ?? [],
    priority: input.priority ?? null,
  });
  return id;
}

export async function deleteLocalItem(db: Executor, id: string): Promise<boolean> {
  const res = await db
    .delete(items)
    .where(and(eq(items.id, id), inArray(items.source, ["planned", "manual"])))
    .returning({ id: items.id });
  return res.length > 0;
}

/* ───────────── Links ───────────── */

export const GITHUB_URL_RE =
  /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/(issues|pull|discussions)\/(\d+)/i;

export function parseGithubUrl(
  url: string,
): { owner: string; name: string; kind: "issue" | "pr" | "discussion"; number: number } | null {
  const m = GITHUB_URL_RE.exec(url.trim());
  if (!m) return null;
  const kind =
    m[3]!.toLowerCase() === "pull"
      ? "pr"
      : m[3]!.toLowerCase() === "issues"
        ? "issue"
        : "discussion";
  return { owner: m[1]!, name: m[2]!, kind, number: Number(m[4]) };
}

export async function addManualLink(
  db: Executor,
  itemId: string,
  target: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let linkedItemId: string | null = null;
  let url = target.trim();
  let meta: {
    title: string | null;
    number: number | null;
    repo: string | null;
    kind: "issue" | "pr" | "discussion" | null;
    state: "open" | "closed" | "merged" | null;
  } = {
    title: null,
    number: null,
    repo: null,
    kind: null,
    state: null,
  };
  const byId = await db.select().from(items).where(eq(items.id, target)).limit(1);
  if (byId[0]) {
    linkedItemId = byId[0].id;
    url = byId[0].url ?? `local:${byId[0].id}`;
    meta = {
      title: byId[0].title,
      number: byId[0].number,
      repo: byId[0].repoFullName,
      kind: byId[0].kind,
      state: byId[0].state,
    };
  } else {
    const parsed = parseGithubUrl(url);
    if (!parsed) return { ok: false, error: "Paste a GitHub issue / PR URL or pick an item" };
    const slug = `${parsed.owner}/${parsed.name}`;
    const found = await db
      .select()
      .from(items)
      .where(
        and(
          sql`lower(${items.repoFullName}) = ${slug.toLowerCase()}`,
          eq(items.number, parsed.number),
        ),
      )
      .limit(1);
    meta = {
      title: found[0]?.title ?? null,
      number: parsed.number,
      repo: slug,
      kind: parsed.kind,
      state: found[0]?.state ?? null,
    };
    linkedItemId = found[0]?.id ?? null;
  }
  if (linkedItemId === itemId) return { ok: false, error: "An item can't link to itself" };
  await db
    .insert(itemLinks)
    .values({
      itemId,
      linkedItemId,
      linkedUrl: url,
      linkedTitle: meta.title,
      linkedNumber: meta.number,
      linkedRepo: meta.repo,
      linkedKind: meta.kind,
      linkedState: meta.state,
      relation: "manual",
      source: "manual",
    })
    .onConflictDoNothing();
  return { ok: true };
}

export async function removeManualLink(db: Executor, linkId: string): Promise<boolean> {
  const res = await db
    .delete(itemLinks)
    .where(and(eq(itemLinks.id, linkId), eq(itemLinks.source, "manual")))
    .returning({ id: itemLinks.id });
  return res.length > 0;
}

/* ───────────── Repo meta ───────────── */

export const repoMetaPatchSchema = z
  .object({
    pinned: z.boolean(),
    muted: z.boolean(),
    programTag: z.string().trim().max(80).nullable(),
    notes: z.string().max(50_000).nullable(),
    setupCommands: z.string().max(10_000).nullable(),
    channel: z.string().max(300).nullable(),
    maintainers: z.array(z.string().trim().min(1).max(60)).max(50),
    claRequired: z.boolean().nullable(),
    dcoRequired: z.boolean().nullable(),
    checklist: z
      .array(
        z.object({ id: z.string().min(1).max(40), text: z.string().max(300), done: z.boolean() }),
      )
      .max(100),
  })
  .partial()
  .strict();

export async function updateRepoMeta(
  db: Executor,
  fullName: string,
  patch: z.infer<typeof repoMetaPatchSchema>,
) {
  const key = fullName.toLowerCase();
  const values = { ...patch, updatedAt: new Date() };
  const [row] = await db
    .insert(repoMeta)
    .values({ repoFullName: key, ...values })
    .onConflictDoUpdate({ target: repoMeta.repoFullName, set: values })
    .returning();
  return row;
}

/* ───────────── Saved views ───────────── */

export const savedViewSchema = z.object({
  name: z.string().trim().min(1).max(80),
  page: z.enum(["items", "pipeline"]).default("items"),
  query: z.string().max(2000),
});

export async function listSavedViews(db: Executor) {
  return db.select().from(savedViews).orderBy(savedViews.createdAt);
}

export async function createSavedView(db: Executor, input: z.infer<typeof savedViewSchema>) {
  const [row] = await db.insert(savedViews).values(input).returning();
  return row;
}

export async function deleteSavedView(db: Executor, id: string) {
  await db.delete(savedViews).where(eq(savedViews.id, id));
}
