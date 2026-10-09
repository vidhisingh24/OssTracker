import { sql } from "drizzle-orm";
import type { Db } from "../db/client";
import {
  items,
  notifications,
  programOrgs,
  programs,
  rateLimits,
  repoMeta,
  syncRuns,
  userMeta,
} from "../db/schema";
import { getState, setState } from "../db/settings";
import { ensureRepoStub, persistSnapshot } from "../sync/persist";
import { DEMO_ME, buildSnapshot, hoursAgo, itemId } from "./builder";
import { DEMO_PLANNED, DEMO_REPOS, DEMO_SPECS } from "./data";
import type { ItemKind, Priority } from "../types";

const D = 24;
export const DEMO_SEED_KEY = "demo.seeded";

/** Tables wiped by a reset, in FK-safe order (CASCADE handles the rest). */
const ALL_TABLES = [
  "item_events",
  "notifications",
  "comments",
  "check_runs",
  "reviews",
  "item_links",
  "user_meta",
  "items",
  "repo_meta",
  "repos",
  "program_orgs",
  "programs",
  "sync_runs",
  "saved_views",
  "rate_limits",
  "outbound_pings",
];

export async function wipeData(db: Db, opts: { keepManual?: boolean } = {}): Promise<void> {
  if (opts.keepManual) {
    // Re-sync from scratch: drop GitHub-derived rows but keep everything the user typed.
    await db.execute(
      sql`truncate table item_events, notifications, comments, check_runs, reviews, sync_runs, rate_limits restart identity`,
    );
    await db.execute(sql`update items set raw_snapshot = null, last_hydrated_at = null`);
    return;
  }
  await db.execute(sql.raw(`truncate table ${ALL_TABLES.join(", ")} restart identity cascade`));
  await db.execute(sql`delete from settings where key like 'state.%' or key = ${DEMO_SEED_KEY}`);
}

export async function isDemoSeeded(db: Db): Promise<boolean> {
  return (await getState<{ at: string }>(db, DEMO_SEED_KEY)) !== null;
}

/** Seed realistic fake data. Runs the real persistence + diff pipeline so events look authentic. */
export async function seedDemo(
  db: Db,
  opts: { now?: Date; force?: boolean } = {},
): Promise<{ items: number }> {
  if (!opts.force && (await isDemoSeeded(db))) return { items: 0 };
  const now = opts.now ?? new Date();
  await wipeData(db);

  const BEFORE = 72;
  for (const spec of DEMO_SPECS) {
    const before = buildSnapshot(spec, DEMO_REPOS, DEMO_SPECS, now, BEFORE);
    const relations = spec.relations ?? [];
    if (before) {
      await persistSnapshot(db, before, {
        me: DEMO_ME,
        now: new Date(now.getTime() - BEFORE * 3_600_000),
        discoveredRelations: relations,
        initialImport: true,
      });
    }
    const current = buildSnapshot(spec, DEMO_REPOS, DEMO_SPECS, now, 0)!;
    await persistSnapshot(db, current, {
      me: DEMO_ME,
      now,
      discoveredRelations: relations,
      initialImport: !before && spec.created > BEFORE,
    });
  }

  // Planned placeholders
  for (const [i, p] of DEMO_PLANNED.entries()) {
    const repoId = await ensureRepoStub(db, p.repo);
    const id = `planned_demo_${i + 1}`;
    await db.insert(items).values({
      id,
      repoId,
      repoFullName: p.repo,
      kind: "issue",
      title: p.title,
      source: "planned",
      stage: "discovered",
      ball: "you",
      nextAction: "Planned — open an issue or comment to claim it",
      ghCreatedAt: new Date(now.getTime() - (i + 2) * D * 3_600_000),
      lastActivityAt: new Date(now.getTime() - (i + 2) * D * 3_600_000),
    });
    await db
      .insert(userMeta)
      .values({ itemId: id, notes: p.notes, tags: p.tags, priority: i === 0 ? "P2" : "P3" });
  }

  // Manual layer on synced items
  const meta: {
    repo: string;
    kind: ItemKind;
    number: number;
    m: Partial<typeof userMeta.$inferInsert>;
  }[] = [
    {
      repo: "excalidraw",
      kind: "pr",
      number: 8421,
      m: {
        priority: "P0",
        tags: ["gsoc", "feature"],
        pinned: true,
        notes:
          "Maintainer wants the **Alt** modifier path tested.\n\n- [x] unit tests\n- [ ] fix e2e flake on chromium\n- [ ] update docs gif",
      },
    },
    {
      repo: "mermaid",
      kind: "pr",
      number: 5932,
      m: {
        priority: "P1",
        tags: ["bugfix"],
        dueAt: new Date(now.getTime() + 20 * 3_600_000),
        notes: "LR layout offset: check `edges.js` `positionEdgeLabel`.",
      },
    },
    {
      repo: "otel",
      kind: "issue",
      number: 5098,
      m: { priority: "P1", tags: ["gsoc", "observability"] },
    },
    {
      repo: "kyverno",
      kind: "pr",
      number: 11502,
      m: {
        priority: "P1",
        tags: ["lfx"],
        remindAt: new Date(now.getTime() - 2 * 3_600_000),
        notes: "Add `synchronize: true` case → then ask for approval.",
      },
    },
    {
      repo: "kyverno",
      kind: "issue",
      number: 11400,
      m: { tags: ["lfx"], dueAt: new Date(now.getTime() - 26 * 3_600_000) },
    },
    {
      repo: "k8s",
      kind: "pr",
      number: 128455,
      m: { priority: "P2", tags: ["go"], waitingOn: "sig-cli triage" },
    },
    { repo: "calcom", kind: "pr", number: 17203, m: { tags: ["bugfix"] } },
    {
      repo: "jaeger",
      kind: "issue",
      number: 6088,
      m: {
        priority: "P3",
        tags: ["gsoc"],
        snoozedUntil: new Date(now.getTime() + 3 * D * 3_600_000),
      },
    },
    {
      repo: "docusaurus",
      kind: "pr",
      number: 10620,
      m: { archived: true, notes: "Closed in favour of swizzling. Lesson: open an issue first." },
    },
    { repo: "p5", kind: "pr", number: 7344, m: { tags: ["docs", "gsoc"] } },
    { repo: "meshery", kind: "pr", number: 12890, m: { priority: "P1", tags: ["lfx", "ui"] } },
  ];
  for (const { repo, kind, number, m } of meta) {
    await db
      .insert(userMeta)
      .values({
        itemId: itemId(repo, kind, number),
        ...m,
        priority: (m.priority as Priority | undefined) ?? null,
      })
      .onConflictDoNothing();
  }

  // Repo notes
  await db.insert(repoMeta).values([
    {
      repoFullName: "excalidraw/excalidraw",
      pinned: true,
      programTag: "GSoC 2027",
      notes: "Very responsive maintainers. Prefer small PRs with a GIF in the description.",
      setupCommands: "yarn\nyarn start",
      channel: "Discord #contributors",
      maintainers: ["dwelle-k", "ad1tyab"],
      claRequired: false,
      dcoRequired: false,
      checklist: [
        { id: "c1", text: "Read CONTRIBUTING.md", done: true },
        { id: "c2", text: "Join Discord", done: true },
        { id: "c3", text: "Land 3 merged PRs", done: false },
      ],
    },
    {
      repoFullName: "kubernetes/kubernetes",
      notes: "Needs `/ok-to-test` from a member before CI runs. Sign the CNCF CLA first.",
      setupCommands: "make WHAT=cmd/kubectl\nhack/verify-gofmt.sh",
      channel: "Slack #sig-cli",
      maintainers: ["soltysh-m", "ardaguclu-b"],
      claRequired: true,
      dcoRequired: false,
      checklist: [{ id: "k1", text: "Sign CNCF CLA", done: true }],
    },
    {
      repoFullName: "kyverno/kyverno",
      pinned: true,
      programTag: "LFX Mentorship",
      notes: "DCO sign-off required on every commit (`git commit -s`).",
      channel: "Slack #kyverno-dev",
      maintainers: ["eddycharly-k", "realshuting-k"],
      dcoRequired: true,
      checklist: [],
    },
    {
      repoFullName: "processing/p5.js",
      pinned: true,
      programTag: "GSoC 2027",
      channel: "Discord #contributors-forum",
      maintainers: ["davepagurek-p"],
      checklist: [],
    },
  ]);

  // Programs
  const [gsoc] = await db
    .insert(programs)
    .values({
      name: "GSoC 2027",
      status: "planning",
      url: "https://summerofcode.withgoogle.com/",
      description: "Google Summer of Code 2027 — target 2 orgs, one strong proposal each.",
      sortOrder: 0,
      deadlines: [
        { id: "g1", label: "Mentoring orgs announced", date: "2027-02-22" },
        { id: "g2", label: "Contributor applications open", date: "2027-03-15" },
        { id: "g3", label: "Proposal deadline", date: "2027-03-30" },
        { id: "g4", label: "Accepted projects announced", date: "2027-05-07" },
      ],
      notes:
        "Start drafting proposals in January. Get maintainer feedback on the outline before submitting.",
    })
    .returning({ id: programs.id });
  const [lfx] = await db
    .insert(programs)
    .values({
      name: "LFX Mentorship — Term 1 2027",
      status: "applying",
      url: "https://mentorship.lfx.linuxfoundation.org/",
      description: "Linux Foundation mentorship (CNCF projects).",
      sortOrder: 1,
      deadlines: [
        { id: "l1", label: "Project list published", date: "2026-11-24" },
        { id: "l2", label: "Applications close", date: "2026-12-09" },
        { id: "l3", label: "Selection notifications", date: "2026-12-23" },
        { id: "l4", label: "Mentorship starts", date: "2027-01-06" },
      ],
    })
    .returning({ id: programs.id });

  await db.insert(programOrgs).values([
    {
      programId: gsoc!.id,
      org: "processing",
      displayName: "Processing Foundation (p5.js)",
      status: "proposal_drafted",
      sortOrder: 0,
      mentors: ["davepagurek-p"],
      proposalUrl: "https://docs.example.com/p5-proposal",
      notes: "Idea: WebGL accessibility descriptions for 3D sketches.",
      links: [
        { label: "Ideas list", url: "https://github.com/processing/Processing-Foundation-GSoC" },
      ],
      checklist: [
        { id: "p1", text: "3 merged PRs", done: true },
        { id: "p2", text: "Draft proposal", done: true },
        { id: "p3", text: "Mentor feedback on draft", done: false },
        { id: "p4", text: "Submit final proposal", done: false },
      ],
    },
    {
      programId: gsoc!.id,
      org: "jaegertracing",
      displayName: "Jaeger (CNCF)",
      status: "contributing",
      sortOrder: 1,
      mentors: ["yurishkuro-j"],
      checklist: [{ id: "j1", text: "Pick a project idea", done: false }],
    },
    {
      programId: gsoc!.id,
      org: "excalidraw",
      displayName: "Excalidraw",
      status: "contributing",
      sortOrder: 2,
      checklist: [],
    },
    {
      programId: gsoc!.id,
      org: "open-telemetry",
      displayName: "OpenTelemetry",
      status: "researching",
      sortOrder: 3,
      checklist: [],
    },
    {
      programId: lfx!.id,
      org: "kyverno",
      displayName: "Kyverno",
      status: "contributing",
      sortOrder: 0,
      mentors: ["eddycharly-k", "realshuting-k"],
      notes: "Project: expand chainsaw e2e coverage.",
      checklist: [
        { id: "y1", text: "Cover letter", done: true },
        { id: "y2", text: "Resume updated", done: true },
        { id: "y3", text: "Complete prerequisite task", done: false },
      ],
    },
    {
      programId: lfx!.id,
      org: "meshery",
      displayName: "Meshery",
      status: "submitted",
      sortOrder: 1,
      mentors: ["leecalcote-r"],
      checklist: [{ id: "m1", text: "Submit application", done: true }],
    },
  ]);

  // GitHub notifications
  const notif = (
    id: string,
    repo: string,
    kind: ItemKind,
    number: number,
    reason: string,
    hours: number,
    unread: boolean,
    title: string,
  ) => ({
    id,
    itemId: itemId(repo, kind, number),
    reason,
    title,
    subjectType: kind === "pr" ? "PullRequest" : kind === "issue" ? "Issue" : "Discussion",
    subjectUrl: null,
    htmlUrl: `https://github.com/${DEMO_REPOS[repo]!.owner}/${DEMO_REPOS[repo]!.name}/${kind === "pr" ? "pull" : "issues"}/${number}`,
    repoFullName: `${DEMO_REPOS[repo]!.owner}/${DEMO_REPOS[repo]!.name}`,
    unread,
    updatedAt: new Date(hoursAgo(now, hours)),
  });
  await db
    .insert(notifications)
    .values([
      notif(
        "9001",
        "excalidraw",
        "pr",
        8421,
        "ci_activity",
        5,
        true,
        "feat: add snap-to-grid toggle for arrows",
      ),
      notif(
        "9002",
        "mermaid",
        "pr",
        5932,
        "comment",
        20,
        true,
        "fix(flowchart): preserve edge labels when collapsing subgraphs",
      ),
      notif(
        "9003",
        "k8s",
        "issue",
        128300,
        "mention",
        9,
        true,
        "kubectl config view shows misleading error for missing current-context",
      ),
      notif(
        "9004",
        "contrib",
        "pr",
        12,
        "review_requested",
        47,
        true,
        "feat: add Telegram quiet-hours support",
      ),
      notif(
        "9005",
        "otel",
        "issue",
        5098,
        "comment",
        30,
        true,
        "instrumentation-http: expose request/response body size attributes",
      ),
      notif(
        "9006",
        "kyverno",
        "pr",
        11502,
        "comment",
        26,
        false,
        "test: add chainsaw e2e tests for generate policies",
      ),
      notif(
        "9007",
        "p5",
        "pr",
        7344,
        "state_change",
        72,
        false,
        "docs: clarify beginShape() vertex winding order",
      ),
      notif(
        "9008",
        "meshery",
        "pr",
        12901,
        "review_requested",
        70,
        false,
        "fix(server): close stale websocket subscriptions",
      ),
      notif(
        "9009",
        "meshery",
        "issue",
        12850,
        "mention",
        6 * D,
        false,
        "Design canvas: support arrow-key nudging of components",
      ),
      notif(
        "9010",
        "calcom",
        "pr",
        17203,
        "author",
        40,
        false,
        "fix: timezone offset in booking confirmation email",
      ),
    ]);

  // Sync history
  const runs: (typeof syncRuns.$inferInsert)[] = [];
  for (let i = 0; i < 18; i++) {
    const started = new Date(now.getTime() - (i * 5 + 2) * 60_000);
    runs.push({
      kind: "hot",
      trigger: "schedule",
      status: "success",
      startedAt: started,
      finishedAt: new Date(started.getTime() + 2400 + (i % 4) * 700),
      itemsTouched: 14 - (i % 5),
      eventsCreated: i === 0 ? 2 : i % 6 === 0 ? 1 : 0,
      apiCost: 3 + (i % 3),
      rateRemaining: 4721 + i * 4,
    });
  }
  for (let i = 0; i < 12; i++) {
    const started = new Date(now.getTime() - (i * 60 + 1) * 1000 * 5);
    runs.push({
      kind: "notifications",
      trigger: "schedule",
      status: "success",
      startedAt: started,
      finishedAt: new Date(started.getTime() + 300),
      itemsTouched: i === 3 ? 2 : 0,
      apiCost: 0,
    });
  }
  runs.push(
    {
      kind: "warm",
      trigger: "schedule",
      status: "success",
      startedAt: new Date(now.getTime() - 34 * 60_000),
      finishedAt: new Date(now.getTime() - 34 * 60_000 + 5100),
      itemsTouched: 9,
      apiCost: 4,
      rateRemaining: 4790,
    },
    {
      kind: "cold",
      trigger: "schedule",
      status: "partial",
      startedAt: new Date(now.getTime() - 3.2 * 3_600_000),
      finishedAt: new Date(now.getTime() - 3.2 * 3_600_000 + 48_000),
      itemsTouched: 41,
      eventsCreated: 3,
      apiCost: 38,
      rateRemaining: 4862,
      error: "1 item could not be hydrated",
      errors: [
        {
          scope: "hydrate:withastro/astro#12001",
          message: "Could not resolve to a node with the global id (item deleted or transferred)",
        },
      ],
    },
    {
      kind: "cold",
      trigger: "manual",
      status: "success",
      startedAt: new Date(now.getTime() - 9.5 * 3_600_000),
      finishedAt: new Date(now.getTime() - 9.5 * 3_600_000 + 51_000),
      itemsTouched: 42,
      eventsCreated: 5,
      apiCost: 41,
      rateRemaining: 4950,
    },
  );
  await db.insert(syncRuns).values(
    runs.map((r) => ({
      ...r,
      progress: { phase: "done", done: r.itemsTouched ?? 0, total: r.itemsTouched ?? 0 },
    })),
  );

  await db.insert(rateLimits).values([
    {
      resource: "graphql",
      limit: 5000,
      remaining: 4721,
      resetAt: new Date(now.getTime() + 41 * 60_000),
    },
    {
      resource: "core",
      limit: 5000,
      remaining: 4988,
      resetAt: new Date(now.getTime() + 41 * 60_000),
    },
  ]);

  await setState(db, DEMO_SEED_KEY, { at: now.toISOString(), me: DEMO_ME });
  return { items: DEMO_SPECS.length + DEMO_PLANNED.length };
}
