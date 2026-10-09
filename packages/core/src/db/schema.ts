import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  AttentionReason,
  ChecklistItem,
  EventPayload,
  ItemSnapshot,
  LabelRef,
  LinkRef,
  ProgramDeadline,
  ReviewRequestRef,
  SyncProgress,
} from "../types";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const itemKind = pgEnum("item_kind", ["issue", "pr", "discussion"]);
export const itemState = pgEnum("item_state", ["open", "closed", "merged"]);
export const itemSource = pgEnum("item_source", ["github", "manual", "planned"]);
export const ciState = pgEnum("ci_state", ["passing", "failing", "pending", "none"]);
export const stage = pgEnum("stage", [
  "discovered",
  "claimed",
  "in_progress",
  "pr_draft",
  "pr_open",
  "in_review",
  "changes_requested",
  "approved",
  "merged",
  "closed",
  "stale",
]);
export const ball = pgEnum("ball", ["you", "maintainer", "ci", "nobody"]);
export const priority = pgEnum("priority", ["P0", "P1", "P2", "P3"]);
export const repoRole = pgEnum("repo_role", ["none", "contributor", "maintainer"]);
export const reviewState = pgEnum("review_state", [
  "APPROVED",
  "CHANGES_REQUESTED",
  "COMMENTED",
  "DISMISSED",
  "PENDING",
]);
export const syncKind = pgEnum("sync_kind", [
  "hot",
  "warm",
  "cold",
  "notifications",
  "item",
  "demo",
]);
export const syncStatus = pgEnum("sync_status", [
  "queued",
  "running",
  "success",
  "partial",
  "failed",
]);
export const programStatus = pgEnum("program_status", [
  "planning",
  "applying",
  "applied",
  "accepted",
  "rejected",
  "completed",
]);
export const orgStatus = pgEnum("org_status", [
  "researching",
  "contributing",
  "proposal_drafted",
  "submitted",
  "accepted",
  "rejected",
]);
export const linkRelation = pgEnum("link_relation", [
  "closes",
  "closed_by",
  "references",
  "manual",
]);

/* ───────────────────────────── GitHub-sourced ───────────────────────────── */

export const repos = pgTable(
  "repos",
  {
    /** GitHub node id, or `repo:<owner>/<name>` for repos only known from planned items. */
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    fullName: text("full_name").notNull(),
    description: text("description"),
    stars: integer("stars").notNull().default(0),
    language: text("language"),
    languageColor: text("language_color"),
    defaultBranch: text("default_branch"),
    isFork: boolean("is_fork").notNull().default(false),
    isArchived: boolean("is_archived").notNull().default(false),
    isPrivate: boolean("is_private").notNull().default(false),
    myRole: repoRole("my_role").notNull().default("none"),
    url: text("url").notNull(),
    ownerAvatarUrl: text("owner_avatar_url"),
    lastSyncedAt: ts("last_synced_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("repos_full_name_idx").on(sql`lower(${t.fullName})`),
    index("repos_owner_idx").on(t.owner),
  ],
);

export const items = pgTable(
  "items",
  {
    /** GitHub node id for synced items; `manual_*` / `planned_*` for local placeholders. */
    id: text("id").primaryKey(),
    repoId: text("repo_id").references(() => repos.id, { onDelete: "set null" }),
    repoFullName: text("repo_full_name").notNull(),
    kind: itemKind("kind").notNull(),
    number: integer("number"),
    title: text("title").notNull(),
    body: text("body"),
    state: itemState("state").notNull().default("open"),
    stateReason: text("state_reason"),
    isDraft: boolean("is_draft").notNull().default(false),
    isLocked: boolean("is_locked").notNull().default(false),
    author: text("author"),
    authorAvatarUrl: text("author_avatar_url"),
    authorAssociation: text("author_association"),
    ghCreatedAt: ts("gh_created_at"),
    ghUpdatedAt: ts("gh_updated_at"),
    closedAt: ts("closed_at"),
    mergedAt: ts("merged_at"),
    mergedBy: text("merged_by"),
    labels: jsonb("labels").$type<LabelRef[]>().notNull().default([]),
    assignees: text("assignees")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    milestone: text("milestone"),
    commentsCount: integer("comments_count").notNull().default(0),
    myRelation: text("my_relation")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    url: text("url"),
    source: itemSource("source").notNull().default("github"),

    // PR-specific
    baseRef: text("base_ref"),
    headRef: text("head_ref"),
    additions: integer("additions"),
    deletions: integer("deletions"),
    changedFiles: integer("changed_files"),
    mergeable: text("mergeable"),
    mergeStateStatus: text("merge_state_status"),
    reviewDecision: text("review_decision"),
    reviewRequests: jsonb("review_requests").$type<ReviewRequestRef[]>().notNull().default([]),
    unresolvedThreads: integer("unresolved_threads").notNull().default(0),
    ciState: ciState("ci_state").notNull().default("none"),
    headSha: text("head_sha"),

    // Derived (recomputed after each hydrate; never user-edited)
    stage: stage("stage").notNull().default("discovered"),
    ball: ball("ball").notNull().default("nobody"),
    attentionScore: real("attention_score").notNull().default(0),
    attentionReasons: jsonb("attention_reasons").$type<AttentionReason[]>().notNull().default([]),
    nextAction: text("next_action"),
    lastActivityAt: ts("last_activity_at"),
    lastMaintainerActivityAt: ts("last_maintainer_activity_at"),
    lastMyActivityAt: ts("last_my_activity_at"),
    firstResponseAt: ts("first_response_at"),
    isStale: boolean("is_stale").notNull().default(false),

    // Sync bookkeeping
    rawSnapshot: jsonb("raw_snapshot").$type<ItemSnapshot | null>(),
    lastHydratedAt: ts("last_hydrated_at"),
    hydrateError: text("hydrate_error"),
    /** Item no longer resolvable on GitHub (deleted, transferred, access lost). */
    isGone: boolean("is_gone").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("items_repo_number_idx")
      .on(sql`lower(${t.repoFullName})`, t.number)
      .where(sql`${t.number} is not null`),
    index("items_repo_idx").on(t.repoId),
    index("items_state_idx").on(t.state),
    index("items_stage_idx").on(t.stage),
    index("items_attention_idx").on(t.attentionScore),
    index("items_gh_updated_idx").on(t.ghUpdatedAt),
    index("items_last_hydrated_idx").on(t.lastHydratedAt),
    index("items_kind_state_idx").on(t.kind, t.state),
  ],
);

export const reviews = pgTable(
  "reviews",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    reviewer: text("reviewer").notNull(),
    reviewerAvatarUrl: text("reviewer_avatar_url"),
    reviewerAssociation: text("reviewer_association"),
    state: reviewState("state").notNull(),
    submittedAt: ts("submitted_at"),
    body: text("body"),
    url: text("url"),
  },
  (t) => [index("reviews_item_idx").on(t.itemId), index("reviews_submitted_idx").on(t.submittedAt)],
);

export const checkRuns = pgTable(
  "check_runs",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** check_run | status_context */
    kind: text("kind").notNull().default("check_run"),
    status: text("status").notNull(),
    conclusion: text("conclusion"),
    url: text("url"),
    completedAt: ts("completed_at"),
  },
  (t) => [index("check_runs_item_idx").on(t.itemId)],
);

export const comments = pgTable(
  "comments",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    author: text("author").notNull(),
    authorAvatarUrl: text("author_avatar_url"),
    authorAssociation: text("author_association"),
    body: text("body").notNull(),
    url: text("url"),
    createdAt: ts("created_at").notNull(),
    isMaintainer: boolean("is_maintainer").notNull().default(false),
    isBot: boolean("is_bot").notNull().default(false),
    isMine: boolean("is_mine").notNull().default(false),
  },
  (t) => [index("comments_item_idx").on(t.itemId, t.createdAt)],
);

export const itemLinks = pgTable(
  "item_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    linkedItemId: text("linked_item_id").references(() => items.id, { onDelete: "set null" }),
    linkedUrl: text("linked_url").notNull(),
    linkedTitle: text("linked_title"),
    linkedNumber: integer("linked_number"),
    linkedRepo: text("linked_repo"),
    linkedKind: itemKind("linked_kind"),
    linkedState: itemState("linked_state"),
    relation: linkRelation("relation").notNull(),
    /** auto = derived from closing references by sync; manual = user-created (sync never deletes). */
    source: text("source").notNull().default("auto"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("item_links_unique_idx").on(t.itemId, t.linkedUrl),
    index("item_links_linked_idx").on(t.linkedItemId),
  ],
);

export const itemEvents = pgTable(
  "item_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    actor: text("actor"),
    payload: jsonb("payload").$type<EventPayload>().notNull().default({}),
    occurredAt: ts("occurred_at").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    /** high-priority events are eligible for external pings */
    priority: text("priority").notNull().default("normal"),
    readAt: ts("read_at"),
    dispatchedAt: ts("dispatched_at"),
    /** Dedupe key so re-running a diff never double-writes the same change. */
    dedupeKey: text("dedupe_key").notNull(),
  },
  (t) => [
    index("item_events_item_idx").on(t.itemId, t.occurredAt),
    index("item_events_occurred_idx").on(t.occurredAt),
    uniqueIndex("item_events_dedupe_idx").on(t.dedupeKey),
    index("item_events_unread_idx").on(t.readAt),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    /** GitHub notification thread id */
    id: text("id").primaryKey(),
    itemId: text("item_id").references(() => items.id, { onDelete: "set null" }),
    reason: text("reason").notNull(),
    title: text("title").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectUrl: text("subject_url"),
    htmlUrl: text("html_url"),
    repoFullName: text("repo_full_name").notNull(),
    unread: boolean("unread").notNull().default(true),
    updatedAt: ts("updated_at").notNull(),
    lastReadAt: ts("last_read_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("notifications_unread_idx").on(t.unread, t.updatedAt),
    index("notifications_item_idx").on(t.itemId),
  ],
);

/* ───────────────────────────── Manual layer ───────────────────────────── */

/** Personal metadata per item. Sync code never writes to this table. */
export const userMeta = pgTable("user_meta", {
  itemId: text("item_id")
    .primaryKey()
    .references(() => items.id, { onDelete: "cascade" }),
  personalStage: stage("personal_stage"),
  priority: priority("priority"),
  tags: text("tags")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  notes: text("notes"),
  dueAt: ts("due_at"),
  remindAt: ts("remind_at"),
  remindedAt: ts("reminded_at"),
  snoozedUntil: ts("snoozed_until"),
  pinned: boolean("pinned").notNull().default(false),
  archived: boolean("archived").notNull().default(false),
  ballOverride: ball("ball_override"),
  waitingOn: text("waiting_on"),
  lastViewedAt: ts("last_viewed_at"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** Personal metadata per repo, keyed by lower-cased full name. Sync never writes here. */
export const repoMeta = pgTable("repo_meta", {
  repoFullName: text("repo_full_name").primaryKey(),
  pinned: boolean("pinned").notNull().default(false),
  muted: boolean("muted").notNull().default(false),
  programTag: text("program_tag"),
  notes: text("notes"),
  setupCommands: text("setup_commands"),
  channel: text("channel"),
  maintainers: text("maintainers")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  claRequired: boolean("cla_required"),
  dcoRequired: boolean("dco_required"),
  checklist: jsonb("checklist").$type<ChecklistItem[]>().notNull().default([]),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const programs = pgTable("programs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  status: programStatus("status").notNull().default("planning"),
  url: text("url"),
  description: text("description"),
  deadlines: jsonb("deadlines").$type<ProgramDeadline[]>().notNull().default([]),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const programOrgs = pgTable(
  "program_orgs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    /** GitHub org (`kubernetes`) or repo (`owner/name`) used to count contributions. */
    org: text("org").notNull(),
    displayName: text("display_name"),
    status: orgStatus("status").notNull().default("researching"),
    mentors: text("mentors")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    notes: text("notes"),
    links: jsonb("links").$type<LinkRef[]>().notNull().default([]),
    checklist: jsonb("checklist").$type<ChecklistItem[]>().notNull().default([]),
    proposalUrl: text("proposal_url"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("program_orgs_program_idx").on(t.programId)],
);

/* ───────────────────────────── System ───────────────────────────── */

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: syncKind("kind").notNull(),
    trigger: text("trigger").notNull().default("schedule"),
    status: syncStatus("status").notNull().default("running"),
    startedAt: ts("started_at").notNull().defaultNow(),
    finishedAt: ts("finished_at"),
    itemsTouched: integer("items_touched").notNull().default(0),
    eventsCreated: integer("events_created").notNull().default(0),
    apiCost: integer("api_cost").notNull().default(0),
    rateRemaining: integer("rate_remaining"),
    error: text("error"),
    errors: jsonb("errors").$type<{ scope: string; message: string }[]>().notNull().default([]),
    progress: jsonb("progress")
      .$type<SyncProgress>()
      .notNull()
      .default({ phase: "starting", done: 0, total: 0 }),
    target: text("target"),
  },
  (t) => [
    index("sync_runs_started_idx").on(t.startedAt),
    index("sync_runs_kind_idx").on(t.kind, t.startedAt),
  ],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const savedViews = pgTable("saved_views", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  page: text("page").notNull().default("items"),
  /** URL search string (filters, sort, columns) — views are just bookmarked URLs. */
  query: text("query").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/** Single-row table holding the connected GitHub identity and the AES-256-GCM encrypted token. */
export const githubAccount = pgTable("github_account", {
  id: integer("id").primaryKey().default(1),
  login: text("login").notNull(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  nodeId: text("node_id"),
  encryptedToken: text("encrypted_token").notNull(),
  scopes: text("scopes"),
  tokenUpdatedAt: ts("token_updated_at").notNull().defaultNow(),
});

export const outboundPings = pgTable(
  "outbound_pings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channel: text("channel").notNull(),
    kind: text("kind").notNull(),
    eventIds: jsonb("event_ids").$type<number[]>().notNull().default([]),
    status: text("status").notNull(),
    error: text("error"),
    sentAt: ts("sent_at").notNull().defaultNow(),
  },
  (t) => [index("outbound_pings_sent_idx").on(t.sentAt)],
);

export const rateLimits = pgTable(
  "rate_limits",
  {
    resource: text("resource").notNull(),
    bucket: text("bucket").notNull().default("default"),
    limit: integer("limit").notNull(),
    remaining: integer("remaining").notNull(),
    resetAt: ts("reset_at").notNull(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.resource, t.bucket] })],
);
