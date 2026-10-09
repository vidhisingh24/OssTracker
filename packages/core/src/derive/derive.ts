import type {
  AttentionReason,
  Ball,
  CheckSnapshot,
  CiState,
  ItemSnapshot,
  Priority,
  Relation,
  ReviewSnapshot,
  Stage,
} from "../types";
import {
  DAY_MS,
  activityFacts,
  isMaintainerAssociation,
  mentions,
  sameLogin,
  submittedReviews,
  toTime,
  type ActivityFacts,
} from "./util";

export interface StaleThresholds {
  prDays: number;
  issueDays: number;
  pingAfterDays: number;
}

export const DEFAULT_STALE: StaleThresholds = { prDays: 14, issueDays: 21, pingAfterDays: 7 };

export interface DeriveContext {
  me: string;
  now: Date;
  stale?: StaleThresholds;
}

/* ───────────────────────── CI ───────────────────────── */

const FAILING_CONCLUSIONS = new Set([
  "FAILURE",
  "TIMED_OUT",
  "CANCELLED",
  "ACTION_REQUIRED",
  "STARTUP_FAILURE",
  "ERROR",
]);

export function isFailingCheck(c: CheckSnapshot): boolean {
  return c.conclusion != null && FAILING_CONCLUSIONS.has(c.conclusion);
}

export function isPendingCheck(c: CheckSnapshot): boolean {
  return c.status !== "COMPLETED" && c.conclusion == null;
}

/** Roll up CI for the PR head commit. Individual checks win over GitHub's rollup when they disagree on failure. */
export function deriveCiState(pr: ItemSnapshot["pr"]): CiState {
  if (!pr) return "none";
  const checks = pr.checks;
  if (checks.some(isFailingCheck)) return "failing";
  if (checks.some(isPendingCheck)) return "pending";
  switch (pr.rollupState) {
    case "FAILURE":
    case "ERROR":
      return "failing";
    case "PENDING":
    case "EXPECTED":
      return "pending";
    case "SUCCESS":
      return "passing";
    default:
      return checks.length > 0 ? "passing" : "none";
  }
}

/* ───────────────────────── Relations ───────────────────────── */

export function deriveRelations(
  s: ItemSnapshot,
  me: string,
  discovered: readonly Relation[] = [],
): Relation[] {
  const out = new Set<Relation>(discovered);
  if (sameLogin(s.author, me)) out.add("author");
  if (s.assignees.some((a) => sameLogin(a, me))) out.add("assignee");
  if (s.comments.some((c) => sameLogin(c.author, me))) out.add("commenter");
  if (s.pr?.reviews.some((r) => sameLogin(r.author, me))) out.add("reviewer");
  if (s.pr?.reviewRequests.some((r) => sameLogin(r.login, me))) out.add("review_requested");
  else out.delete("review_requested");
  if (mentions(s.body, me) || s.comments.some((c) => mentions(c.body, me))) out.add("mentioned");
  if (out.size === 0) out.add("involved");
  else if (out.size > 1) out.delete("involved");
  return [...out].sort();
}

/* ───────────────────────── Review state ───────────────────────── */

/** Latest effective review per reviewer (ignores COMMENTED when a decisive review exists). */
export function latestReviewStates(s: ItemSnapshot): Map<string, ReviewSnapshot> {
  const byReviewer = new Map<string, ReviewSnapshot>();
  const sorted = [...submittedReviews(s)].sort(
    (a, b) => (toTime(a.submittedAt) ?? 0) - (toTime(b.submittedAt) ?? 0),
  );
  for (const r of sorted) {
    if (sameLogin(r.author, s.author)) continue;
    const key = r.author.toLowerCase();
    const prev = byReviewer.get(key);
    if (r.state === "COMMENTED" && prev && prev.state !== "COMMENTED" && prev.state !== "DISMISSED")
      continue;
    byReviewer.set(key, r);
  }
  return byReviewer;
}

function effectiveDecision(s: ItemSnapshot): "APPROVED" | "CHANGES_REQUESTED" | null {
  if (!s.pr) return null;
  if (s.pr.reviewDecision === "CHANGES_REQUESTED") return "CHANGES_REQUESTED";
  if (s.pr.reviewDecision === "APPROVED") return "APPROVED";
  const latest = [...latestReviewStates(s).values()];
  if (latest.some((r) => r.state === "CHANGES_REQUESTED")) return "CHANGES_REQUESTED";
  // Repos without required reviews report reviewDecision=null; an approval still counts.
  if (s.pr.reviewDecision == null && latest.some((r) => r.state === "APPROVED")) return "APPROVED";
  return null;
}

/* ───────────────────────── Stage ───────────────────────── */

export function isStaleSnapshot(
  s: ItemSnapshot,
  ctx: DeriveContext,
  facts?: ActivityFacts,
): boolean {
  if (s.state !== "open") return false;
  const th = ctx.stale ?? DEFAULT_STALE;
  const f = facts ?? activityFacts(s, ctx.me);
  const last = f.lastActivityAt ?? toTime(s.updatedAt) ?? toTime(s.createdAt);
  if (last == null) return false;
  const days = (ctx.now.getTime() - last) / DAY_MS;
  if (s.kind === "pr") {
    if (effectiveDecision(s) === "APPROVED") return false;
    return days > th.prDays;
  }
  return days > th.issueDays;
}

export function deriveStage(s: ItemSnapshot, ctx: DeriveContext, facts?: ActivityFacts): Stage {
  const f = facts ?? activityFacts(s, ctx.me);
  if (s.kind === "pr") {
    if (s.state === "merged") return "merged";
    if (s.state === "closed") return "closed";
    if (s.isDraft) return isStaleSnapshot(s, ctx, f) ? "stale" : "pr_draft";
    const decision = effectiveDecision(s);
    if (decision === "CHANGES_REQUESTED") return "changes_requested";
    if (decision === "APPROVED") return "approved";
    if (isStaleSnapshot(s, ctx, f)) return "stale";
    const othersReviewed = submittedReviews(s).some((r) => !sameLogin(r.author, s.author));
    if (othersReviewed || (s.pr?.reviewRequests.length ?? 0) > 0) return "in_review";
    return "pr_open";
  }
  if (s.state !== "open") return "closed";
  const myOpenPr = s.closedByPrs.some((p) => p.state === "open" && sameLogin(p.author, ctx.me));
  if (myOpenPr) return "in_progress";
  if (isStaleSnapshot(s, ctx, f)) return "stale";
  const engaged =
    sameLogin(s.author, ctx.me) ||
    s.assignees.some((a) => sameLogin(a, ctx.me)) ||
    s.comments.some((c) => sameLogin(c.author, ctx.me));
  return engaged ? "claimed" : "discovered";
}

/* ───────────────────────── Ball in court ───────────────────────── */

export function deriveBall(s: ItemSnapshot, ctx: DeriveContext, facts?: ActivityFacts): Ball {
  if (s.state !== "open") return "nobody";
  const f = facts ?? activityFacts(s, ctx.me);
  const me = ctx.me;
  const replyPending =
    f.lastOtherActivityAt != null &&
    (f.lastMyActivityAt == null || f.lastOtherActivityAt > f.lastMyActivityAt);

  if (s.kind === "pr" && s.pr) {
    if (s.pr.reviewRequests.some((r) => sameLogin(r.login, me))) return "you";
    if (sameLogin(s.author, me)) {
      if (s.pr.mergeable === "CONFLICTING") return "you";
      if (effectiveDecision(s) === "CHANGES_REQUESTED") return "you";
      const ci = deriveCiState(s.pr);
      if (ci === "failing") return "you";
      if (s.pr.unresolvedThreads > 0 && replyPending) return "you";
      if (f.mentionedAfterMine) return "you";
      if (replyPending && f.lastOtherIsMaintainer) return "you";
      if (s.isDraft) return "you";
      if (ci === "pending") return "ci";
      return "maintainer";
    }
    if (f.mentionedAfterMine) return "you";
    return "nobody";
  }

  // Issues & discussions
  const mine = sameLogin(s.author, me);
  const assigned = s.assignees.some((a) => sameLogin(a, me));
  const commented = s.comments.some((c) => sameLogin(c.author, me));
  if (f.mentionedAfterMine) return "you";
  if (s.closedByPrs.some((p) => p.state === "open" && sameLogin(p.author, me))) return "nobody";
  if ((mine || commented || assigned) && replyPending) return "you";
  if (assigned) return "you";
  if (mine || commented) return "maintainer";
  return "nobody";
}

/* ───────────────────────── Attention ───────────────────────── */

export const ATTENTION_WEIGHTS = {
  overdue: 60,
  ci_failed: 50,
  changes_requested: 45,
  review_requested: 40,
  conflict: 35,
  due_soon: 35,
  new_reply: 30,
  reminder: 30,
  mention: 25,
  unresolved_threads: 20,
  stale_ping: 15,
  approved_unmerged: 5,
} as const;

/** Signals derived from GitHub data alone (computed during sync, stored on the item). */
export function syncAttentionReasons(
  s: ItemSnapshot,
  ctx: DeriveContext,
  facts?: ActivityFacts,
): AttentionReason[] {
  if (s.state !== "open") return [];
  const f = facts ?? activityFacts(s, ctx.me);
  const me = ctx.me;
  const reasons: AttentionReason[] = [];
  const add = (code: AttentionReason["code"], label: string, actor?: string) =>
    reasons.push(
      actor
        ? { code, label, weight: ATTENTION_WEIGHTS[code], actor }
        : { code, label, weight: ATTENTION_WEIGHTS[code] },
    );
  // An issue whose fix is my open PR: the PR carries the attention, not the issue.
  const workInPr =
    s.kind !== "pr" && s.closedByPrs.some((p) => p.state === "open" && sameLogin(p.author, me));
  const myItem = sameLogin(s.author, me);
  const involved =
    myItem ||
    s.assignees.some((a) => sameLogin(a, me)) ||
    s.comments.some((c) => sameLogin(c.author, me));
  const replyPending =
    f.lastOtherActivityAt != null &&
    (f.lastMyActivityAt == null || f.lastOtherActivityAt > f.lastMyActivityAt);

  if (s.kind === "pr" && s.pr) {
    if (s.pr.reviewRequests.some((r) => sameLogin(r.login, me)))
      add("review_requested", "Review requested");
    if (myItem) {
      const ci = deriveCiState(s.pr);
      const decision = effectiveDecision(s);
      if (ci === "failing") add("ci_failed", "CI failed");
      if (decision === "CHANGES_REQUESTED") add("changes_requested", "Changes requested");
      if (s.pr.mergeable === "CONFLICTING") add("conflict", "Merge conflict");
      if (s.pr.unresolvedThreads > 0 && decision !== "CHANGES_REQUESTED")
        add(
          "unresolved_threads",
          `${s.pr.unresolvedThreads} unresolved thread${s.pr.unresolvedThreads === 1 ? "" : "s"}`,
        );
      if (decision === "APPROVED" && ci !== "failing")
        add("approved_unmerged", "Approved, awaiting merge");
    }
  }
  if (f.mentionedAfterMine)
    add("mention", `Mentioned by @${f.mentionedAfterMine.actor}`, f.mentionedAfterMine.actor);
  else if (involved && replyPending && f.lastOtherActor && !workInPr) {
    add(
      "new_reply",
      f.lastOtherIsMaintainer ? "Maintainer replied" : "New reply",
      f.lastOtherActor,
    );
    if (f.lastOtherIsMaintainer) reasons[reasons.length - 1]!.weight += 10;
  }

  // Waiting a long time on a maintainer with no response → suggest a ping.
  const th = ctx.stale ?? DEFAULT_STALE;
  if (
    myItem &&
    !workInPr &&
    !replyPending &&
    !reasons.some((r) => r.code !== "approved_unmerged")
  ) {
    const since = f.lastMyActivityAt ?? toTime(s.createdAt);
    const maintainerSince = f.lastMaintainerActivityAt;
    if (since != null && (maintainerSince == null || maintainerSince < since)) {
      const days = Math.floor((ctx.now.getTime() - since) / DAY_MS);
      if (days >= th.pingAfterDays) add("stale_ping", `No maintainer reply in ${days}d`);
    }
  }
  return reasons;
}

export interface MetaSignals {
  priority?: Priority | null;
  dueAt?: Date | string | null;
  remindAt?: Date | string | null;
  remindedAt?: Date | string | null;
  snoozedUntil?: Date | string | null;
  archived?: boolean;
  pinned?: boolean;
}

const PRIORITY_BOOST: Record<Priority, number> = { P0: 30, P1: 15, P2: 5, P3: 0 };

function asTime(v: Date | string | null | undefined): number | null {
  if (v == null) return null;
  return v instanceof Date ? v.getTime() : toTime(v);
}

/**
 * Final attention score: GitHub signals + manual layer (due dates, reminders, priority, snooze).
 * Pure; cheap enough to run on every read so time-based signals are always fresh.
 */
export function computeAttention(
  input: { state: string; syncReasons: AttentionReason[]; lastActivityAt?: Date | string | null },
  meta: MetaSignals,
  now: Date,
): { score: number; reasons: AttentionReason[] } {
  if (input.state !== "open" && !meta.dueAt) return { score: 0, reasons: [] };
  if (meta.archived) return { score: 0, reasons: [] };
  const snoozed = asTime(meta.snoozedUntil);
  if (snoozed != null && snoozed > now.getTime()) return { score: 0, reasons: [] };

  const reasons = input.state === "open" ? [...input.syncReasons] : [];
  const due = asTime(meta.dueAt);
  if (due != null) {
    const hours = (due - now.getTime()) / 3_600_000;
    if (hours < 0)
      reasons.push({ code: "overdue", label: "Overdue", weight: ATTENTION_WEIGHTS.overdue });
    else if (hours <= 48)
      reasons.push({
        code: "due_soon",
        label: hours <= 24 ? "Due today" : "Due soon",
        weight: ATTENTION_WEIGHTS.due_soon,
      });
  }
  const remind = asTime(meta.remindAt);
  if (remind != null && remind <= now.getTime()) {
    reasons.push({ code: "reminder", label: "Reminder", weight: ATTENTION_WEIGHTS.reminder });
  }
  if (reasons.length === 0) return { score: 0, reasons };

  let score = reasons.reduce((sum, r) => sum + r.weight, 0);
  if (meta.priority) score += PRIORITY_BOOST[meta.priority];
  if (meta.pinned) score += 5;
  const last = asTime(input.lastActivityAt ?? null);
  if (last != null) {
    const ageHours = (now.getTime() - last) / 3_600_000;
    if (ageHours >= 0 && ageHours < 48) score += Math.round(10 * (1 - ageHours / 48));
  }
  reasons.sort((a, b) => b.weight - a.weight);
  return { score, reasons };
}

/** Reasons that put an item in the "Needs you" queue (approvals and ping suggestions are informational). */
export function needsYou(reasons: AttentionReason[]): boolean {
  return reasons.some((r) => r.code !== "approved_unmerged" && r.code !== "stale_ping");
}

/* ───────────────────────── Next action ───────────────────────── */

export function nextAction(
  s: ItemSnapshot,
  stage: Stage,
  ball: Ball,
  reasons: AttentionReason[],
  ctx: DeriveContext,
): string {
  const top = reasons
    .filter((r) => r.code !== "approved_unmerged")
    .sort((a, b) => b.weight - a.weight)[0];
  const failing = s.pr?.checks.filter(isFailingCheck).map((c) => c.name) ?? [];
  const reviewers = [...latestReviewStates(s).values()]
    .filter((r) => r.state === "CHANGES_REQUESTED")
    .map((r) => `@${r.author}`);
  switch (top?.code) {
    case "ci_failed":
      return failing.length
        ? `Fix failing check${failing.length > 1 ? "s" : ""}: ${failing.slice(0, 2).join(", ")}${failing.length > 2 ? ` +${failing.length - 2}` : ""}`
        : "Fix the failing CI run";
    case "changes_requested":
      return reviewers.length
        ? `Address changes requested by ${reviewers.join(", ")}`
        : "Address the requested changes";
    case "conflict":
      return `Rebase on ${s.pr?.baseRef ?? "the base branch"} to resolve merge conflicts`;
    case "review_requested":
      return "Review this pull request";
    case "mention":
      return top.actor ? `Respond to @${top.actor}'s mention` : "Respond to the mention";
    case "new_reply":
      return top.actor ? `Reply to @${top.actor}` : "Reply to the latest comment";
    case "unresolved_threads":
      return `Resolve ${top.label}`;
    case "stale_ping":
      return `${top.label} — a polite ping might help`;
    default:
      break;
  }
  if (stage === "merged") return "Merged — nothing left to do";
  if (stage === "closed") return s.kind === "pr" ? "Closed without merging" : "Closed";
  if (stage === "approved") return "Approved — waiting for a maintainer to merge";
  if (stage === "pr_draft") return "Finish the draft and mark it ready for review";
  if (ball === "ci") return "Waiting for CI to finish";
  if (stage === "in_review" || stage === "pr_open") return "Waiting on maintainer review";
  if (stage === "in_progress") return "PR open — keep it moving";
  if (stage === "stale")
    return sameLogin(s.author, ctx.me) ? "Gone quiet — ping or close it" : "Gone quiet";
  if (stage === "claimed" && s.kind === "issue" && s.assignees.some((a) => sameLogin(a, ctx.me)))
    return "Assigned to you — open a PR";
  if (ball === "maintainer") return "Waiting on maintainers";
  return "Nothing needed right now";
}

/* ───────────────────────── Bundle ───────────────────────── */

export interface Derived {
  ciState: CiState;
  stage: Stage;
  ball: Ball;
  isStale: boolean;
  reasons: AttentionReason[];
  /** Score from GitHub signals only (manual layer applied at read time). */
  baseScore: number;
  nextAction: string;
  relations: Relation[];
  lastActivityAt: Date | null;
  lastMaintainerActivityAt: Date | null;
  lastMyActivityAt: Date | null;
  firstResponseAt: Date | null;
  maintainerReviewers: string[];
}

const toDate = (t: number | null) => (t == null ? null : new Date(t));

export function deriveAll(
  s: ItemSnapshot,
  ctx: DeriveContext,
  discovered: readonly Relation[] = [],
): Derived {
  const facts = activityFacts(s, ctx.me);
  const ciState = deriveCiState(s.pr);
  const stage = deriveStage(s, ctx, facts);
  const ball = deriveBall(s, ctx, facts);
  const reasons = syncAttentionReasons(s, ctx, facts);
  const { score } = computeAttention(
    { state: s.state, syncReasons: reasons, lastActivityAt: toDate(facts.lastActivityAt) },
    {},
    ctx.now,
  );
  return {
    ciState,
    stage,
    ball,
    isStale: isStaleSnapshot(s, ctx, facts),
    reasons,
    baseScore: score,
    nextAction: nextAction(s, stage, ball, reasons, ctx),
    relations: deriveRelations(s, ctx.me, discovered),
    lastActivityAt: toDate(facts.lastActivityAt),
    lastMaintainerActivityAt: toDate(facts.lastMaintainerActivityAt),
    lastMyActivityAt: toDate(facts.lastMyActivityAt),
    firstResponseAt: toDate(facts.firstResponseAt),
    maintainerReviewers: (s.pr?.reviews ?? [])
      .filter((r) => isMaintainerAssociation(r.authorAssociation) && !sameLogin(r.author, ctx.me))
      .map((r) => r.author),
  };
}
