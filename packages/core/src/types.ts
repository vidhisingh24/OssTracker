import { z } from "zod";

/* ───────────── Enums (mirrored in the Drizzle schema) ───────────── */

export const STAGES = [
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
] as const;
export type Stage = (typeof STAGES)[number];

export const BALLS = ["you", "maintainer", "ci", "nobody"] as const;
export type Ball = (typeof BALLS)[number];

export const CI_STATES = ["passing", "failing", "pending", "none"] as const;
export type CiState = (typeof CI_STATES)[number];

export const PRIORITIES = ["P0", "P1", "P2", "P3"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const ITEM_KINDS = ["issue", "pr", "discussion"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const ITEM_STATES = ["open", "closed", "merged"] as const;
export type ItemState = (typeof ITEM_STATES)[number];

export const RELATIONS = [
  "author",
  "assignee",
  "commenter",
  "reviewer",
  "mentioned",
  "review_requested",
  "involved",
] as const;
export type Relation = (typeof RELATIONS)[number];

export const ORG_STATUSES = [
  "researching",
  "contributing",
  "proposal_drafted",
  "submitted",
  "accepted",
  "rejected",
] as const;
export type OrgStatus = (typeof ORG_STATUSES)[number];

export const PROGRAM_STATUSES = [
  "planning",
  "applying",
  "applied",
  "accepted",
  "rejected",
  "completed",
] as const;
export type ProgramStatus = (typeof PROGRAM_STATUSES)[number];

export const EVENT_TYPES = [
  "discovered",
  "opened",
  "review_requested",
  "review_request_removed",
  "approved",
  "changes_requested",
  "reviewed",
  "ci_failed",
  "ci_recovered",
  "ci_pending",
  "new_comment",
  "maintainer_replied",
  "mentioned",
  "merged",
  "closed",
  "reopened",
  "label_added",
  "label_removed",
  "assigned",
  "unassigned",
  "ready_for_review",
  "converted_to_draft",
  "conflict",
  "conflict_resolved",
  "became_stale",
  "threads_unresolved",
  "title_changed",
  "linked",
  "gone",
  "reminder",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Event types that may trigger external pings (email / Telegram / ntfy). */
export const HIGH_PRIORITY_EVENTS: readonly EventType[] = [
  "ci_failed",
  "changes_requested",
  "maintainer_replied",
  "review_requested",
  "mentioned",
  "reminder",
];

export const ATTENTION_CODES = [
  "ci_failed",
  "changes_requested",
  "conflict",
  "review_requested",
  "new_reply",
  "mention",
  "unresolved_threads",
  "overdue",
  "due_soon",
  "reminder",
  "stale_ping",
  "approved_unmerged",
] as const;
export type AttentionCode = (typeof ATTENTION_CODES)[number];

/* ───────────── JSON column shapes ───────────── */

export interface LabelRef {
  name: string;
  color: string;
}

export interface ReviewRequestRef {
  login: string;
  kind: "user" | "team" | "bot";
  avatarUrl?: string | null;
}

export interface AttentionReason {
  code: AttentionCode;
  label: string;
  weight: number;
  /** Who triggered it (reply / mention author), when relevant. */
  actor?: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface LinkRef {
  label: string;
  url: string;
}

export interface ProgramDeadline {
  id: string;
  label: string;
  /** ISO date or datetime */
  date: string;
  done?: boolean;
}

export interface SyncProgress {
  phase: string;
  done: number;
  total: number;
  message?: string;
}

export type EventPayload = Record<string, string | number | boolean | null | string[]>;

/* ───────────── Normalized snapshot (diffing + derivation input) ───────────── */

export interface RepoSnapshot {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  stars: number;
  language: string | null;
  languageColor: string | null;
  defaultBranch: string | null;
  isFork: boolean;
  isArchived: boolean;
  isPrivate: boolean;
  url: string;
  ownerAvatarUrl: string | null;
  viewerPermission: string | null;
}

export interface CheckSnapshot {
  id: string;
  name: string;
  kind: "check_run" | "status_context";
  /** COMPLETED | IN_PROGRESS | QUEUED | PENDING | WAITING | REQUESTED (status contexts map to these) */
  status: string;
  /** SUCCESS | FAILURE | NEUTRAL | CANCELLED | SKIPPED | TIMED_OUT | ACTION_REQUIRED | STALE | STARTUP_FAILURE | ERROR | null */
  conclusion: string | null;
  url: string | null;
  completedAt: string | null;
}

export interface ReviewSnapshot {
  id: string;
  author: string;
  authorAvatarUrl: string | null;
  authorAssociation: string | null;
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED" | "PENDING";
  submittedAt: string | null;
  body: string;
  url: string | null;
}

export interface CommentSnapshot {
  id: string;
  author: string;
  authorAvatarUrl: string | null;
  authorAssociation: string | null;
  isBot: boolean;
  body: string;
  createdAt: string;
  url: string | null;
}

export interface LinkedRefSnapshot {
  id: string;
  number: number;
  title: string;
  url: string;
  repo: string;
  kind: ItemKind;
  state: ItemState;
  author: string | null;
  isDraft?: boolean;
}

export interface TimelineSnapshot {
  id: string;
  type: string;
  actor: string | null;
  createdAt: string;
  detail?: string | null;
}

export interface PrSnapshot {
  baseRef: string;
  headRef: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
  mergeStateStatus: string | null;
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
  reviewRequests: ReviewRequestRef[];
  unresolvedThreads: number;
  totalThreads: number;
  headSha: string | null;
  /** Rolled-up status from GitHub (SUCCESS | FAILURE | ERROR | PENDING | EXPECTED) */
  rollupState: string | null;
  checks: CheckSnapshot[];
  reviews: ReviewSnapshot[];
  closingIssues: LinkedRefSnapshot[];
}

export interface ItemSnapshot {
  id: string;
  kind: ItemKind;
  repo: RepoSnapshot;
  number: number;
  title: string;
  body: string;
  state: ItemState;
  stateReason: string | null;
  isDraft: boolean;
  isLocked: boolean;
  author: string | null;
  authorAvatarUrl: string | null;
  authorAssociation: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  mergedAt: string | null;
  mergedBy: string | null;
  labels: LabelRef[];
  assignees: string[];
  milestone: string | null;
  commentsCount: number;
  url: string;
  comments: CommentSnapshot[];
  timeline: TimelineSnapshot[];
  /** Issues: PRs that will close this issue when merged. */
  closedByPrs: LinkedRefSnapshot[];
  participants: string[];
  pr: PrSnapshot | null;
}

/* ───────────── Settings ───────────── */

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const settingsSchema = z.object({
  sync: z
    .object({
      hotMinutes: z.number().int().min(2).max(120).default(5),
      warmMinutes: z
        .number()
        .int()
        .min(10)
        .max(24 * 60)
        .default(60),
      coldHours: z.number().int().min(1).max(72).default(6),
      notificationsMinSeconds: z.number().int().min(60).max(3600).default(60),
      warmWindowDays: z.number().int().min(1).max(365).default(30),
      discoveryLookbackDays: z.number().int().min(30).max(3650).default(1095),
      excludeOwnRepos: z.boolean().default(false),
      excludedRepos: z.array(z.string()).default([]),
      excludedOrgs: z.array(z.string()).default([]),
      /** Stop non-essential work when GraphQL points remaining drop below this. */
      minRateRemaining: z.number().int().min(0).max(5000).default(500),
    })
    .default({
      hotMinutes: 5,
      warmMinutes: 60,
      coldHours: 6,
      notificationsMinSeconds: 60,
      warmWindowDays: 30,
      discoveryLookbackDays: 1095,
      excludeOwnRepos: false,
      excludedRepos: [],
      excludedOrgs: [],
      minRateRemaining: 500,
    }),
  stale: z
    .object({
      prDays: z.number().int().min(1).max(365).default(14),
      issueDays: z.number().int().min(1).max(365).default(21),
      pingAfterDays: z.number().int().min(1).max(365).default(7),
    })
    .default({ prDays: 14, issueDays: 21, pingAfterDays: 7 }),
  notify: z
    .object({
      email: z.boolean().default(false),
      telegram: z.boolean().default(false),
      ntfy: z.boolean().default(false),
      events: z.array(z.enum(EVENT_TYPES)).default([...HIGH_PRIORITY_EVENTS]),
      quietHours: z
        .object({
          enabled: z.boolean().default(true),
          start: hhmm.default("22:00"),
          end: hhmm.default("08:00"),
        })
        .default({ enabled: true, start: "22:00", end: "08:00" }),
      digest: z
        .object({
          enabled: z.boolean().default(false),
          hour: z.number().int().min(0).max(23).default(8),
        })
        .default({ enabled: false, hour: 8 }),
      timezone: z.string().default("Asia/Kolkata"),
      markReadOnGithub: z.boolean().default(false),
    })
    .default({
      email: false,
      telegram: false,
      ntfy: false,
      events: [...HIGH_PRIORITY_EVENTS],
      quietHours: { enabled: true, start: "22:00", end: "08:00" },
      digest: { enabled: false, hour: 8 },
      timezone: "Asia/Kolkata",
      markReadOnGithub: false,
    }),
});
export type Settings = z.infer<typeof settingsSchema>;
export type SettingsInput = z.input<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({});

/* ───────────── API-facing view models ───────────── */

export interface ItemMeta {
  personalStage: Stage | null;
  priority: Priority | null;
  tags: string[];
  notes: string | null;
  dueAt: string | null;
  remindAt: string | null;
  snoozedUntil: string | null;
  pinned: boolean;
  archived: boolean;
  ballOverride: Ball | null;
  waitingOn: string | null;
  lastViewedAt: string | null;
}

export const EMPTY_META: ItemMeta = {
  personalStage: null,
  priority: null,
  tags: [],
  notes: null,
  dueAt: null,
  remindAt: null,
  snoozedUntil: null,
  pinned: false,
  archived: false,
  ballOverride: null,
  waitingOn: null,
  lastViewedAt: null,
};

/** Row shape returned by list endpoints (table, kanban, Today). */
export interface ItemRow {
  id: string;
  kind: ItemKind;
  source: "github" | "manual" | "planned";
  repoFullName: string;
  number: number | null;
  title: string;
  url: string | null;
  state: ItemState;
  isDraft: boolean;
  author: string | null;
  authorAvatarUrl: string | null;
  labels: LabelRef[];
  myRelation: string[];
  ciState: CiState;
  reviewDecision: string | null;
  mergeable: string | null;
  unresolvedThreads: number;
  commentsCount: number;
  additions: number | null;
  deletions: number | null;
  stage: Stage;
  /** stage after applying the manual override */
  effectiveStage: Stage;
  ball: Ball;
  effectiveBall: Ball;
  attentionScore: number;
  attentionReasons: AttentionReason[];
  nextAction: string | null;
  isStale: boolean;
  ghCreatedAt: string | null;
  ghUpdatedAt: string | null;
  closedAt: string | null;
  mergedAt: string | null;
  lastActivityAt: string | null;
  lastHydratedAt: string | null;
  reviewers: { login: string; avatarUrl: string | null; state: string }[];
  meta: ItemMeta;
  programTag: string | null;
  hasUnseenActivity: boolean;
}
