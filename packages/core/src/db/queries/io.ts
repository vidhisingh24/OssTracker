import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../client";
import {
  itemLinks,
  items,
  programOrgs,
  programs,
  repoMeta,
  savedViews,
  settings,
  userMeta,
} from "../schema";
import type { ItemRow } from "../../types";
import { ensureRepoStub } from "../../sync/persist";

export const BACKUP_VERSION = 1;

/** Everything the user typed. GitHub data is not exported: it can always be re-synced. */
export async function exportBackup(db: Db) {
  const [meta, rmeta, progs, orgs, views, planned, manualLinks, appSettings] = await Promise.all([
    db.select().from(userMeta),
    db.select().from(repoMeta),
    db.select().from(programs),
    db.select().from(programOrgs),
    db.select().from(savedViews),
    db
      .select()
      .from(items)
      .where(inArray(items.source, ["planned", "manual"])),
    db.select().from(itemLinks).where(eq(itemLinks.source, "manual")),
    db.select().from(settings).where(eq(settings.key, "app")),
  ]);
  return {
    app: "contrib",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: appSettings[0]?.value ?? null,
    userMeta: meta,
    repoMeta: rmeta,
    programs: progs,
    programOrgs: orgs,
    savedViews: views,
    localItems: planned.map((p) => ({
      id: p.id,
      repoFullName: p.repoFullName,
      kind: p.kind,
      number: p.number,
      title: p.title,
      url: p.url,
      source: p.source,
    })),
    manualLinks,
  };
}

const dateish = z
  .union([z.string(), z.date()])
  .nullable()
  .optional()
  .transform((v) => (v == null ? null : new Date(v)));

export const backupSchema = z.object({
  app: z.literal("contrib"),
  version: z.number().int().max(BACKUP_VERSION),
  settings: z.unknown().optional(),
  userMeta: z
    .array(
      z.object({
        itemId: z.string(),
        personalStage: z.string().nullable().optional(),
        priority: z.string().nullable().optional(),
        tags: z.array(z.string()).default([]),
        notes: z.string().nullable().optional(),
        dueAt: dateish,
        remindAt: dateish,
        snoozedUntil: dateish,
        pinned: z.boolean().default(false),
        archived: z.boolean().default(false),
        ballOverride: z.string().nullable().optional(),
        waitingOn: z.string().nullable().optional(),
      }),
    )
    .default([]),
  repoMeta: z.array(z.record(z.string(), z.unknown())).default([]),
  programs: z.array(z.record(z.string(), z.unknown())).default([]),
  programOrgs: z.array(z.record(z.string(), z.unknown())).default([]),
  savedViews: z
    .array(z.object({ name: z.string(), page: z.string(), query: z.string() }))
    .default([]),
  localItems: z
    .array(
      z.object({
        id: z.string(),
        repoFullName: z.string(),
        kind: z.enum(["issue", "pr", "discussion"]),
        number: z.number().nullable(),
        title: z.string(),
        url: z.string().nullable(),
        source: z.enum(["planned", "manual"]),
      }),
    )
    .default([]),
});

/** Restore a backup. Idempotent: existing rows are updated, nothing is deleted. */
export async function importBackup(
  db: Db,
  raw: unknown,
): Promise<{ meta: number; programs: number; localItems: number }> {
  const data = backupSchema.parse(raw);
  return db.transaction(async (tx) => {
    for (const li of data.localItems) {
      const repoId = await ensureRepoStub(tx, li.repoFullName);
      await tx
        .insert(items)
        .values({
          id: li.id,
          repoId,
          repoFullName: li.repoFullName,
          kind: li.kind,
          number: li.source === "planned" ? null : li.number,
          title: li.title,
          url: li.url,
          source: li.source,
        })
        .onConflictDoNothing();
    }
    const existing = new Set((await tx.select({ id: items.id }).from(items)).map((r) => r.id));
    let metaCount = 0;
    for (const m of data.userMeta) {
      if (!existing.has(m.itemId)) continue;
      const values = {
        personalStage: (m.personalStage ?? null) as typeof userMeta.$inferInsert.personalStage,
        priority: (m.priority ?? null) as typeof userMeta.$inferInsert.priority,
        tags: m.tags,
        notes: m.notes ?? null,
        dueAt: m.dueAt,
        remindAt: m.remindAt,
        snoozedUntil: m.snoozedUntil,
        pinned: m.pinned,
        archived: m.archived,
        ballOverride: (m.ballOverride ?? null) as typeof userMeta.$inferInsert.ballOverride,
        waitingOn: m.waitingOn ?? null,
      };
      await tx
        .insert(userMeta)
        .values({ itemId: m.itemId, ...values })
        .onConflictDoUpdate({ target: userMeta.itemId, set: values });
      metaCount++;
    }
    for (const r of data.repoMeta) {
      const row = r as typeof repoMeta.$inferInsert;
      if (!row.repoFullName) continue;
      const { repoFullName, updatedAt: _u, ...rest } = row;
      await tx
        .insert(repoMeta)
        .values({ repoFullName, ...rest })
        .onConflictDoUpdate({ target: repoMeta.repoFullName, set: rest });
    }
    for (const p of data.programs) {
      const row = p as typeof programs.$inferInsert;
      const { createdAt: _c, updatedAt: _u, ...rest } = row;
      await tx.insert(programs).values(rest).onConflictDoUpdate({ target: programs.id, set: rest });
    }
    for (const o of data.programOrgs) {
      const row = o as typeof programOrgs.$inferInsert;
      const { createdAt: _c, updatedAt: _u, ...rest } = row;
      await tx
        .insert(programOrgs)
        .values(rest)
        .onConflictDoUpdate({ target: programOrgs.id, set: rest });
    }
    for (const v of data.savedViews) await tx.insert(savedViews).values(v);
    if (data.settings) {
      await tx
        .insert(settings)
        .values({ key: "app", value: data.settings })
        .onConflictDoUpdate({ target: settings.key, set: { value: data.settings } });
    }
    return { meta: metaCount, programs: data.programs.length, localItems: data.localItems.length };
  });
}

const CSV_COLUMNS: [string, (r: ItemRow) => string | number | null][] = [
  ["repo", (r) => r.repoFullName],
  ["number", (r) => r.number],
  ["kind", (r) => r.kind],
  ["title", (r) => r.title],
  ["state", (r) => r.state],
  ["stage", (r) => r.effectiveStage],
  ["ball", (r) => r.effectiveBall],
  ["ci", (r) => r.ciState],
  ["priority", (r) => r.meta.priority],
  ["tags", (r) => r.meta.tags.join(" ")],
  ["labels", (r) => r.labels.map((l) => l.name).join(" ")],
  ["attention", (r) => r.attentionScore],
  ["next_action", (r) => r.nextAction],
  ["created_at", (r) => r.ghCreatedAt],
  ["updated_at", (r) => r.ghUpdatedAt],
  ["merged_at", (r) => r.mergedAt],
  ["due_at", (r) => r.meta.dueAt],
  ["url", (r) => r.url],
];

export function rowsToCsv(rows: ItemRow[]): string {
  const esc = (v: string | number | null) => {
    if (v == null) return "";
    const s = String(v);
    // Neutralise spreadsheet formula injection.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [
    CSV_COLUMNS.map(([h]) => h).join(","),
    ...rows.map((r) => CSV_COLUMNS.map(([, f]) => esc(f(r))).join(",")),
  ].join("\n");
}
