import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "../client";
import { items, programOrgs, programs, repoMeta, repos, reviews } from "../schema";
import { formatDuration, median } from "../../derive";
import {
  ORG_STATUSES,
  PROGRAM_STATUSES,
  type ChecklistItem,
  type LinkRef,
  type ProgramDeadline,
} from "../../types";

export interface RepoCard {
  id: string;
  fullName: string;
  owner: string;
  name: string;
  description: string | null;
  url: string;
  stars: number;
  language: string | null;
  languageColor: string | null;
  myRole: string;
  isPlaceholder: boolean;
  stats: {
    issues: number;
    openPrs: number;
    mergedPrs: number;
    closedPrs: number;
    needsYou: number;
    medianMergeHours: number | null;
    medianMergeLabel: string;
    medianFirstResponseHours: number | null;
    lastActivityAt: string | null;
  };
  reviewersOfMe: { login: string; count: number }[];
  health: "great" | "good" | "slow" | "quiet" | "new";
  meta: typeof repoMeta.$inferSelect | null;
}

export async function listRepos(db: Executor, me: string): Promise<RepoCard[]> {
  const [repoRows, itemRows, metaRows, reviewRows] = await Promise.all([
    db.select().from(repos),
    db
      .select({
        repoId: items.repoId,
        repo: items.repoFullName,
        kind: items.kind,
        state: items.state,
        relation: items.myRelation,
        author: items.author,
        created: items.ghCreatedAt,
        merged: items.mergedAt,
        firstResponse: items.firstResponseAt,
        lastActivity: items.lastActivityAt,
        score: items.attentionScore,
        ball: items.ball,
      })
      .from(items)
      .where(eq(items.isGone, false)),
    db.select().from(repoMeta),
    db
      .select({
        repo: items.repoFullName,
        reviewer: reviews.reviewer,
        assoc: reviews.reviewerAssociation,
      })
      .from(reviews)
      .innerJoin(items, eq(items.id, reviews.itemId))
      .where(
        and(
          sql`lower(${items.author}) = ${me.toLowerCase()}`,
          sql`lower(${reviews.reviewer}) <> ${me.toLowerCase()}`,
        ),
      ),
  ]);
  const metaByName = new Map(metaRows.map((m) => [m.repoFullName, m]));
  const now = Date.now();

  return repoRows
    .map((r): RepoCard => {
      const key = r.fullName.toLowerCase();
      const mine = itemRows.filter((i) => i.repo.toLowerCase() === key);
      const myPrs = mine.filter(
        (i) => i.kind === "pr" && i.author?.toLowerCase() === me.toLowerCase(),
      );
      const mergeHours = myPrs
        .filter((p) => p.merged && p.created)
        .map((p) => (p.merged!.getTime() - p.created!.getTime()) / 3_600_000);
      const frHours = mine
        .filter((p) => p.firstResponse && p.created && p.author?.toLowerCase() === me.toLowerCase())
        .map((p) => (p.firstResponse!.getTime() - p.created!.getTime()) / 3_600_000);
      const last = mine.reduce<Date | null>(
        (acc, i) => (i.lastActivity && (!acc || i.lastActivity > acc) ? i.lastActivity : acc),
        null,
      );
      const revCounts = new Map<string, number>();
      for (const rv of reviewRows)
        if (rv.repo.toLowerCase() === key)
          revCounts.set(rv.reviewer, (revCounts.get(rv.reviewer) ?? 0) + 1);
      const medMerge = median(mergeHours);
      const medFr = median(frHours);
      const health: RepoCard["health"] =
        myPrs.length === 0 && mine.length <= 1
          ? "new"
          : last && now - last.getTime() > 45 * 86_400_000
            ? "quiet"
            : medFr != null && medFr <= 48
              ? "great"
              : medFr != null && medFr > 24 * 7
                ? "slow"
                : "good";
      return {
        id: r.id,
        fullName: r.fullName,
        owner: r.owner,
        name: r.name,
        description: r.description,
        url: r.url,
        stars: r.stars,
        language: r.language,
        languageColor: r.languageColor,
        myRole: r.myRole,
        isPlaceholder: r.id.startsWith("repo:"),
        stats: {
          issues: mine.filter((i) => i.kind !== "pr").length,
          openPrs: myPrs.filter((p) => p.state === "open").length,
          mergedPrs: myPrs.filter((p) => p.state === "merged").length,
          closedPrs: myPrs.filter((p) => p.state === "closed").length,
          needsYou: mine.filter((i) => i.state === "open" && (i.ball === "you" || i.score >= 25))
            .length,
          medianMergeHours: medMerge,
          medianMergeLabel: formatDuration(medMerge),
          medianFirstResponseHours: medFr,
          lastActivityAt: last?.toISOString() ?? null,
        },
        reviewersOfMe: [...revCounts.entries()]
          .map(([login, count]) => ({ login, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 6),
        health,
        meta: metaByName.get(key) ?? null,
      };
    })
    .sort(
      (a, b) =>
        Number(b.meta?.pinned ?? false) - Number(a.meta?.pinned ?? false) ||
        (b.stats.lastActivityAt ?? "").localeCompare(a.stats.lastActivityAt ?? ""),
    );
}

/* ───────────── Programs ───────────── */

export interface ProgramView {
  id: string;
  name: string;
  status: string;
  url: string | null;
  description: string | null;
  deadlines: ProgramDeadline[];
  notes: string | null;
  orgs: {
    id: string;
    org: string;
    displayName: string | null;
    status: string;
    mentors: string[];
    notes: string | null;
    links: LinkRef[];
    checklist: ChecklistItem[];
    proposalUrl: string | null;
    contributions: { mergedPrs: number; openPrs: number; issues: number; total: number };
  }[];
}

export async function listPrograms(db: Executor, me: string): Promise<ProgramView[]> {
  const [progRows, orgRows, itemRows] = await Promise.all([
    db.select().from(programs).orderBy(asc(programs.sortOrder), asc(programs.createdAt)),
    db.select().from(programOrgs).orderBy(asc(programOrgs.sortOrder), asc(programOrgs.createdAt)),
    db
      .select({
        repo: items.repoFullName,
        kind: items.kind,
        state: items.state,
        author: items.author,
        relation: items.myRelation,
      })
      .from(items)
      .where(and(eq(items.isGone, false), inArray(items.source, ["github", "manual"]))),
  ]);
  const meLower = me.toLowerCase();
  const countFor = (org: string) => {
    const o = org.toLowerCase();
    const matches = itemRows.filter((i) => {
      const slug = i.repo.toLowerCase();
      return o.includes("/") ? slug === o : slug.startsWith(`${o}/`);
    });
    const mineAuthored = matches.filter((i) => i.author?.toLowerCase() === meLower);
    const mergedPrs = mineAuthored.filter((i) => i.kind === "pr" && i.state === "merged").length;
    const openPrs = mineAuthored.filter((i) => i.kind === "pr" && i.state === "open").length;
    const issues = matches.filter(
      (i) =>
        i.kind !== "pr" &&
        (i.relation.includes("author") ||
          i.relation.includes("commenter") ||
          i.relation.includes("assignee")),
    ).length;
    return { mergedPrs, openPrs, issues, total: mergedPrs + openPrs + issues };
  };
  return progRows.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    url: p.url,
    description: p.description,
    deadlines: [...p.deadlines].sort((a, b) => a.date.localeCompare(b.date)),
    notes: p.notes,
    orgs: orgRows
      .filter((o) => o.programId === p.id)
      .map((o) => ({
        id: o.id,
        org: o.org,
        displayName: o.displayName,
        status: o.status,
        mentors: o.mentors,
        notes: o.notes,
        links: o.links,
        checklist: o.checklist,
        proposalUrl: o.proposalUrl,
        contributions: countFor(o.org),
      })),
  }));
}

const checklistSchema = z
  .array(z.object({ id: z.string().min(1).max(40), text: z.string().max(300), done: z.boolean() }))
  .max(100);
const deadlineSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().trim().min(1).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  done: z.boolean().optional(),
});

export const programInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  status: z.enum(PROGRAM_STATUSES).default("planning"),
  url: z.url().nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  deadlines: z.array(deadlineSchema).max(50).default([]),
  notes: z.string().max(50_000).nullable().optional(),
});
export const programPatchSchema = programInputSchema.partial().strict();

export const orgInputSchema = z.object({
  org: z
    .string()
    .trim()
    .min(1)
    .max(140)
    .regex(/^[\w.-]+(\/[\w.-]+)?$/, "GitHub org or owner/repo"),
  displayName: z.string().trim().max(120).nullable().optional(),
  status: z.enum(ORG_STATUSES).default("researching"),
  mentors: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  notes: z.string().max(50_000).nullable().optional(),
  links: z
    .array(z.object({ label: z.string().max(80), url: z.url() }))
    .max(30)
    .default([]),
  checklist: checklistSchema.default([]),
  proposalUrl: z.url().nullable().optional(),
});
export const orgPatchSchema = orgInputSchema.partial().strict();

export async function createProgram(db: Executor, input: z.infer<typeof programInputSchema>) {
  const [row] = await db.insert(programs).values(input).returning();
  return row;
}
export async function updateProgram(
  db: Executor,
  id: string,
  patch: z.infer<typeof programPatchSchema>,
) {
  const [row] = await db
    .update(programs)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(programs.id, id))
    .returning();
  return row ?? null;
}
export async function deleteProgram(db: Executor, id: string) {
  await db.delete(programs).where(eq(programs.id, id));
}
export async function createOrg(
  db: Executor,
  programId: string,
  input: z.infer<typeof orgInputSchema>,
) {
  const [row] = await db
    .insert(programOrgs)
    .values({ ...input, programId })
    .returning();
  return row;
}
export async function updateOrg(db: Executor, id: string, patch: z.infer<typeof orgPatchSchema>) {
  const [row] = await db
    .update(programOrgs)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(programOrgs.id, id))
    .returning();
  return row ?? null;
}
export async function deleteOrg(db: Executor, id: string) {
  await db.delete(programOrgs).where(eq(programOrgs.id, id));
}
