import type { CiState, EventPayload, EventType, ItemSnapshot } from "../types";
import { deriveCiState, isFailingCheck } from "./derive";
import { isBotLogin, isMaintainerAssociation, mentions, sameLogin } from "./util";

export interface EventDraft {
  type: EventType;
  actor: string | null;
  payload: EventPayload;
  occurredAt: Date;
  priority: "high" | "normal" | "low";
  dedupeKey: string;
}

export interface DiffContext {
  me: string;
  now: Date;
  /** Stage-level staleness before and after, computed by the caller. */
  wasStale?: boolean;
  isStale?: boolean;
}

const at = (iso: string | null | undefined, fallback: Date) => (iso ? new Date(iso) : fallback);

/**
 * Compare two snapshots of the same item and describe what changed as append-only events.
 * Pure and deterministic: identical inputs always yield identical dedupe keys, so re-running a
 * sync never duplicates events.
 */
export function diffSnapshots(
  prev: ItemSnapshot | null,
  next: ItemSnapshot,
  ctx: DiffContext,
): EventDraft[] {
  const id = next.id;
  const me = ctx.me;
  const mine = sameLogin(next.author, me);
  const out: EventDraft[] = [];
  const push = (e: Omit<EventDraft, "dedupeKey"> & { key: string }) => {
    const { key, ...rest } = e;
    out.push({ ...rest, dedupeKey: `${id}:${e.type}:${key}` });
  };

  if (!prev) {
    push({
      type: "discovered",
      actor: next.author,
      payload: { kind: next.kind, state: next.state },
      occurredAt: at(next.createdAt, ctx.now),
      priority: "low",
      key: "first",
    });
    return out;
  }

  // State transitions
  if (prev.state !== next.state) {
    if (next.state === "merged") {
      push({
        type: "merged",
        actor: next.mergedBy,
        payload: {},
        occurredAt: at(next.mergedAt, ctx.now),
        priority: mine ? "high" : "normal",
        key: next.mergedAt ?? "x",
      });
    } else if (next.state === "closed") {
      push({
        type: "closed",
        actor: null,
        payload: { reason: next.stateReason },
        occurredAt: at(next.closedAt, ctx.now),
        priority: mine ? "high" : "normal",
        key: next.closedAt ?? next.updatedAt,
      });
    } else if (next.state === "open") {
      push({
        type: "reopened",
        actor: null,
        payload: {},
        occurredAt: at(next.updatedAt, ctx.now),
        priority: "normal",
        key: next.updatedAt,
      });
    }
  }

  if (prev.title !== next.title) {
    push({
      type: "title_changed",
      actor: null,
      payload: { from: prev.title, to: next.title },
      occurredAt: at(next.updatedAt, ctx.now),
      priority: "low",
      key: next.title,
    });
  }

  if (next.kind === "pr" && next.pr) {
    const pp = prev.pr;
    const np = next.pr;
    if (prev.isDraft && !next.isDraft && next.state === "open") {
      push({
        type: "ready_for_review",
        actor: next.author,
        payload: {},
        occurredAt: at(next.updatedAt, ctx.now),
        priority: "normal",
        key: next.updatedAt,
      });
    } else if (!prev.isDraft && next.isDraft) {
      push({
        type: "converted_to_draft",
        actor: next.author,
        payload: {},
        occurredAt: at(next.updatedAt, ctx.now),
        priority: "low",
        key: next.updatedAt,
      });
    }

    // Review requests
    const prevReq = new Set((pp?.reviewRequests ?? []).map((r) => r.login.toLowerCase()));
    const nextReq = new Set(np.reviewRequests.map((r) => r.login.toLowerCase()));
    for (const r of np.reviewRequests) {
      if (!prevReq.has(r.login.toLowerCase())) {
        const forMe = sameLogin(r.login, me);
        push({
          type: "review_requested",
          actor: null,
          payload: { reviewer: r.login, forMe },
          occurredAt: at(next.updatedAt, ctx.now),
          priority: forMe ? "high" : "normal",
          key: `${r.login.toLowerCase()}:${next.updatedAt}`,
        });
      }
    }
    for (const login of prevReq) {
      if (!nextReq.has(login)) {
        push({
          type: "review_request_removed",
          actor: null,
          payload: { reviewer: login },
          occurredAt: at(next.updatedAt, ctx.now),
          priority: "low",
          key: `${login}:${next.updatedAt}`,
        });
      }
    }

    // New reviews
    const seenReviews = new Set((pp?.reviews ?? []).map((r) => r.id));
    for (const r of np.reviews) {
      if (seenReviews.has(r.id) || r.state === "PENDING" || sameLogin(r.author, me)) continue;
      const type: EventType =
        r.state === "APPROVED"
          ? "approved"
          : r.state === "CHANGES_REQUESTED"
            ? "changes_requested"
            : "reviewed";
      push({
        type,
        actor: r.author,
        payload: {
          maintainer: isMaintainerAssociation(r.authorAssociation),
          excerpt: excerpt(r.body),
        },
        occurredAt: at(r.submittedAt, ctx.now),
        priority: mine && type !== "reviewed" ? "high" : "normal",
        key: r.id,
      });
    }

    // CI
    const prevCi: CiState = deriveCiState(pp ?? null);
    const nextCi: CiState = deriveCiState(np);
    if (prevCi !== nextCi) {
      const sha = np.headSha ?? "nosha";
      if (nextCi === "failing") {
        const failing = np.checks.filter(isFailingCheck).map((c) => c.name);
        push({
          type: "ci_failed",
          actor: null,
          payload: { checks: failing },
          occurredAt: latestCheckTime(np.checks) ?? ctx.now,
          priority: mine ? "high" : "normal",
          key: `${sha}:${failing.join(",")}`,
        });
      } else if (nextCi === "passing" && prevCi === "failing") {
        push({
          type: "ci_recovered",
          actor: null,
          payload: {},
          occurredAt: latestCheckTime(np.checks) ?? ctx.now,
          priority: "normal",
          key: sha,
        });
      }
    }

    // Merge conflicts
    if (
      pp &&
      pp.mergeable !== "CONFLICTING" &&
      np.mergeable === "CONFLICTING" &&
      next.state === "open"
    ) {
      push({
        type: "conflict",
        actor: null,
        payload: { base: np.baseRef },
        occurredAt: at(next.updatedAt, ctx.now),
        priority: mine ? "high" : "normal",
        key: `${np.headSha ?? ""}:${next.updatedAt}`,
      });
    } else if (pp?.mergeable === "CONFLICTING" && np.mergeable === "MERGEABLE") {
      push({
        type: "conflict_resolved",
        actor: null,
        payload: {},
        occurredAt: at(next.updatedAt, ctx.now),
        priority: "normal",
        key: `${np.headSha ?? ""}:${next.updatedAt}`,
      });
    }

    if ((pp?.unresolvedThreads ?? 0) < np.unresolvedThreads && mine) {
      push({
        type: "threads_unresolved",
        actor: null,
        payload: { count: np.unresolvedThreads },
        occurredAt: at(next.updatedAt, ctx.now),
        priority: "normal",
        key: `${np.unresolvedThreads}:${next.updatedAt}`,
      });
    }

    const prevClosing = new Set((pp?.closingIssues ?? []).map((i) => i.id));
    for (const i of np.closingIssues) {
      if (!prevClosing.has(i.id)) {
        push({
          type: "linked",
          actor: null,
          payload: { target: `${i.repo}#${i.number}`, title: i.title },
          occurredAt: at(next.updatedAt, ctx.now),
          priority: "low",
          key: i.id,
        });
      }
    }
  }

  if (next.kind !== "pr") {
    const prevClosing = new Set(prev.closedByPrs.map((i) => i.id));
    for (const i of next.closedByPrs) {
      if (!prevClosing.has(i.id)) {
        push({
          type: "linked",
          actor: i.author,
          payload: { target: `${i.repo}#${i.number}`, title: i.title },
          occurredAt: at(next.updatedAt, ctx.now),
          priority: "low",
          key: i.id,
        });
      }
    }
  }

  // Comments
  const seenComments = new Set(prev.comments.map((c) => c.id));
  const involved =
    mine ||
    next.assignees.some((a) => sameLogin(a, me)) ||
    prev.comments.some((c) => sameLogin(c.author, me));
  for (const c of next.comments) {
    if (seenComments.has(c.id) || sameLogin(c.author, me)) continue;
    const bot = c.isBot || isBotLogin(c.author);
    const maintainer = isMaintainerAssociation(c.authorAssociation) && !bot;
    const mentioned = mentions(c.body, me);
    const type: EventType = mentioned
      ? "mentioned"
      : maintainer
        ? "maintainer_replied"
        : "new_comment";
    push({
      type,
      actor: c.author,
      payload: { maintainer, bot, excerpt: excerpt(c.body), url: c.url },
      occurredAt: at(c.createdAt, ctx.now),
      priority: bot ? "low" : mentioned || (maintainer && involved) ? "high" : "normal",
      key: c.id,
    });
  }

  // Labels
  const prevLabels = new Set(prev.labels.map((l) => l.name));
  const nextLabels = new Set(next.labels.map((l) => l.name));
  for (const l of nextLabels) {
    if (!prevLabels.has(l))
      push({
        type: "label_added",
        actor: null,
        payload: { label: l },
        occurredAt: at(next.updatedAt, ctx.now),
        priority: "low",
        key: `${l}:${next.updatedAt}`,
      });
  }
  for (const l of prevLabels) {
    if (!nextLabels.has(l))
      push({
        type: "label_removed",
        actor: null,
        payload: { label: l },
        occurredAt: at(next.updatedAt, ctx.now),
        priority: "low",
        key: `${l}:${next.updatedAt}`,
      });
  }

  // Assignees
  const prevAssignees = new Set(prev.assignees.map((a) => a.toLowerCase()));
  const nextAssignees = new Set(next.assignees.map((a) => a.toLowerCase()));
  for (const a of next.assignees) {
    if (!prevAssignees.has(a.toLowerCase())) {
      const forMe = sameLogin(a, me);
      push({
        type: "assigned",
        actor: null,
        payload: { assignee: a, forMe },
        occurredAt: at(next.updatedAt, ctx.now),
        priority: forMe ? "high" : "low",
        key: `${a.toLowerCase()}:${next.updatedAt}`,
      });
    }
  }
  for (const a of prevAssignees) {
    if (!nextAssignees.has(a))
      push({
        type: "unassigned",
        actor: null,
        payload: { assignee: a },
        occurredAt: at(next.updatedAt, ctx.now),
        priority: "low",
        key: `${a}:${next.updatedAt}`,
      });
  }

  if (!ctx.wasStale && ctx.isStale) {
    push({
      type: "became_stale",
      actor: null,
      payload: {},
      occurredAt: ctx.now,
      priority: "normal",
      key: next.updatedAt,
    });
  }

  return out;
}

function excerpt(body: string | null | undefined, max = 180): string {
  if (!body) return "";
  const flat = body
    .replace(/```[\s\S]*?```/g, "[code]")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function latestCheckTime(checks: { completedAt: string | null }[]): Date | null {
  let best: number | null = null;
  for (const c of checks) {
    const t = c.completedAt ? Date.parse(c.completedAt) : NaN;
    if (!Number.isNaN(t) && (best == null || t > best)) best = t;
  }
  return best == null ? null : new Date(best);
}
