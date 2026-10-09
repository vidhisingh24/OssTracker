import type {
  AttentionCode,
  Ball,
  CiState,
  EventType,
  OrgStatus,
  ProgramStatus,
  Stage,
} from "../types";

/** Semantic tone → maps to CSS tokens (`--tone-*`). Never used without an icon + label. */
export type Tone = "attention" | "info" | "success" | "danger" | "warning" | "neutral";

export const STAGE_META: Record<
  Stage,
  { label: string; tone: Tone; order: number; description: string }
> = {
  discovered: {
    label: "Discovered",
    tone: "neutral",
    order: 0,
    description: "You are involved but haven't engaged yet",
  },
  claimed: {
    label: "Claimed",
    tone: "attention",
    order: 1,
    description: "You commented, were assigned, or opened it",
  },
  in_progress: {
    label: "In progress",
    tone: "attention",
    order: 2,
    description: "Work underway — a linked PR is open",
  },
  pr_draft: { label: "PR draft", tone: "neutral", order: 3, description: "Draft pull request" },
  pr_open: { label: "PR open", tone: "info", order: 4, description: "Open, no reviews yet" },
  in_review: {
    label: "In review",
    tone: "info",
    order: 5,
    description: "Reviews requested or in progress",
  },
  changes_requested: {
    label: "Changes requested",
    tone: "danger",
    order: 6,
    description: "A reviewer asked for changes",
  },
  approved: {
    label: "Approved",
    tone: "success",
    order: 7,
    description: "Approved, waiting to merge",
  },
  merged: { label: "Merged", tone: "success", order: 8, description: "Merged" },
  closed: { label: "Closed", tone: "neutral", order: 9, description: "Closed without merging" },
  stale: {
    label: "Stale",
    tone: "warning",
    order: 10,
    description: "No activity past your stale threshold",
  },
};

export const BALL_META: Record<Ball, { label: string; tone: Tone; short: string }> = {
  you: { label: "Your move", tone: "attention", short: "You" },
  maintainer: { label: "Waiting on maintainers", tone: "info", short: "Maintainer" },
  ci: { label: "Waiting on CI", tone: "warning", short: "CI" },
  nobody: { label: "Nobody", tone: "neutral", short: "—" },
};

export const CI_META: Record<CiState, { label: string; tone: Tone }> = {
  passing: { label: "Passing", tone: "success" },
  failing: { label: "Failing", tone: "danger" },
  pending: { label: "Pending", tone: "warning" },
  none: { label: "No checks", tone: "neutral" },
};

export const REASON_META: Record<AttentionCode, { short: string; tone: Tone }> = {
  ci_failed: { short: "CI failed", tone: "danger" },
  changes_requested: { short: "Changes requested", tone: "danger" },
  conflict: { short: "Conflict", tone: "danger" },
  review_requested: { short: "Review requested", tone: "info" },
  new_reply: { short: "New reply", tone: "attention" },
  mention: { short: "Mentioned", tone: "attention" },
  unresolved_threads: { short: "Threads", tone: "warning" },
  overdue: { short: "Overdue", tone: "danger" },
  due_soon: { short: "Due", tone: "warning" },
  reminder: { short: "Reminder", tone: "attention" },
  stale_ping: { short: "Ping?", tone: "warning" },
  approved_unmerged: { short: "Approved", tone: "success" },
};

export const EVENT_META: Record<EventType, { label: string; tone: Tone }> = {
  discovered: { label: "Started tracking", tone: "neutral" },
  opened: { label: "Opened", tone: "info" },
  review_requested: { label: "Review requested", tone: "info" },
  review_request_removed: { label: "Review request removed", tone: "neutral" },
  approved: { label: "Approved", tone: "success" },
  changes_requested: { label: "Changes requested", tone: "danger" },
  reviewed: { label: "Reviewed", tone: "info" },
  ci_failed: { label: "CI failed", tone: "danger" },
  ci_recovered: { label: "CI recovered", tone: "success" },
  ci_pending: { label: "CI running", tone: "warning" },
  new_comment: { label: "New comment", tone: "neutral" },
  maintainer_replied: { label: "Maintainer replied", tone: "attention" },
  mentioned: { label: "Mentioned you", tone: "attention" },
  merged: { label: "Merged", tone: "success" },
  closed: { label: "Closed", tone: "neutral" },
  reopened: { label: "Reopened", tone: "info" },
  label_added: { label: "Label added", tone: "neutral" },
  label_removed: { label: "Label removed", tone: "neutral" },
  assigned: { label: "Assigned", tone: "attention" },
  unassigned: { label: "Unassigned", tone: "neutral" },
  ready_for_review: { label: "Ready for review", tone: "info" },
  converted_to_draft: { label: "Converted to draft", tone: "neutral" },
  conflict: { label: "Merge conflict", tone: "danger" },
  conflict_resolved: { label: "Conflict resolved", tone: "success" },
  became_stale: { label: "Went stale", tone: "warning" },
  threads_unresolved: { label: "New review threads", tone: "warning" },
  title_changed: { label: "Title changed", tone: "neutral" },
  linked: { label: "Linked", tone: "info" },
  gone: { label: "No longer on GitHub", tone: "neutral" },
  reminder: { label: "Reminder", tone: "attention" },
};

export const ORG_STATUS_META: Record<OrgStatus, { label: string; tone: Tone; order: number }> = {
  researching: { label: "Researching", tone: "neutral", order: 0 },
  contributing: { label: "Contributing", tone: "info", order: 1 },
  proposal_drafted: { label: "Proposal drafted", tone: "attention", order: 2 },
  submitted: { label: "Submitted", tone: "warning", order: 3 },
  accepted: { label: "Accepted", tone: "success", order: 4 },
  rejected: { label: "Not selected", tone: "neutral", order: 5 },
};

export const PROGRAM_STATUS_META: Record<ProgramStatus, { label: string; tone: Tone }> = {
  planning: { label: "Planning", tone: "neutral" },
  applying: { label: "Applying", tone: "attention" },
  applied: { label: "Applied", tone: "warning" },
  accepted: { label: "Accepted", tone: "success" },
  rejected: { label: "Not selected", tone: "neutral" },
  completed: { label: "Completed", tone: "success" },
};

export const RELATION_LABELS: Record<string, string> = {
  author: "Author",
  assignee: "Assignee",
  commenter: "Commenter",
  reviewer: "Reviewer",
  mentioned: "Mentioned",
  review_requested: "Review requested",
  involved: "Involved",
};
