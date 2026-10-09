import type { CommentSnapshot, ItemSnapshot, ReviewSnapshot } from "../types";

export const DAY_MS = 86_400_000;

const KNOWN_BOTS = new Set([
  "dependabot",
  "renovate",
  "codecov",
  "github-actions",
  "netlify",
  "vercel",
  "coderabbitai",
  "sonarcloud",
  "allcontributors",
  "stale",
  "mergify",
  "k8s-ci-robot",
  "copilot",
]);

const MAINTAINER_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

export function isMaintainerAssociation(association: string | null | undefined): boolean {
  return association ? MAINTAINER_ASSOCIATIONS.has(association) : false;
}

export function isBotLogin(login: string | null | undefined): boolean {
  if (!login) return false;
  const l = login.toLowerCase();
  return l.endsWith("[bot]") || l.endsWith("-bot") || KNOWN_BOTS.has(l);
}

export function sameLogin(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

export function mentions(body: string | null | undefined, login: string): boolean {
  if (!body) return false;
  const escaped = login.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\w/])@${escaped}(?![\\w-])`, "i").test(body);
}

export function toTime(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

export function maxTime(...values: (number | null | undefined)[]): number | null {
  let out: number | null = null;
  for (const v of values) if (v != null && (out == null || v > out)) out = v;
  return out;
}

export function humanComments(s: ItemSnapshot): CommentSnapshot[] {
  return s.comments.filter((c) => !c.isBot && !isBotLogin(c.author));
}

export function submittedReviews(s: ItemSnapshot): ReviewSnapshot[] {
  return (s.pr?.reviews ?? []).filter((r) => r.state !== "PENDING");
}

export interface ActivityFacts {
  /** Most recent human activity of any kind (comments, reviews, timeline, creation). */
  lastActivityAt: number | null;
  /** Most recent comment/review by a maintainer who is not me. */
  lastMaintainerActivityAt: number | null;
  /** Most recent comment/review/timeline action by me (including authoring). */
  lastMyActivityAt: number | null;
  /** Most recent comment/review by someone other than me (human). */
  lastOtherActivityAt: number | null;
  lastOtherActor: string | null;
  lastOtherIsMaintainer: boolean;
  /** First comment/review from someone other than the author. */
  firstResponseAt: number | null;
  /** Someone else mentioned me after my last activity. */
  mentionedAfterMine: { actor: string; at: number } | null;
}

export function activityFacts(s: ItemSnapshot, me: string): ActivityFacts {
  const created = toTime(s.createdAt);
  let lastActivity = created;
  let lastMaintainer: number | null = null;
  let lastMine: number | null = sameLogin(s.author, me) ? created : null;
  let lastOther: number | null = null;
  let lastOtherActor: string | null = null;
  let lastOtherIsMaintainer = false;
  let firstResponse: number | null = null;

  /** `awaitsReply=false` for approvals: they move the item forward but don't ask anything of me. */
  type Entry = {
    actor: string;
    at: number;
    assoc: string | null;
    body: string;
    awaitsReply: boolean;
  };
  const entries: Entry[] = [];
  for (const c of humanComments(s)) {
    const at = toTime(c.createdAt);
    if (at != null)
      entries.push({
        actor: c.author,
        at,
        assoc: c.authorAssociation,
        body: c.body,
        awaitsReply: true,
      });
  }
  for (const r of submittedReviews(s)) {
    const at = toTime(r.submittedAt);
    if (at != null && !isBotLogin(r.author))
      entries.push({
        actor: r.author,
        at,
        assoc: r.authorAssociation,
        body: r.body,
        awaitsReply: r.state !== "APPROVED" && r.state !== "DISMISSED",
      });
  }
  entries.sort((a, b) => a.at - b.at);

  for (const e of entries) {
    lastActivity = maxTime(lastActivity, e.at);
    if (sameLogin(e.actor, me)) {
      lastMine = maxTime(lastMine, e.at);
    } else {
      if (e.awaitsReply && (lastOther == null || e.at >= lastOther)) {
        lastOther = e.at;
        lastOtherActor = e.actor;
        lastOtherIsMaintainer = isMaintainerAssociation(e.assoc);
      }
      if (isMaintainerAssociation(e.assoc)) lastMaintainer = maxTime(lastMaintainer, e.at);
      if (firstResponse == null && !sameLogin(e.actor, s.author)) firstResponse = e.at;
    }
  }
  for (const t of s.timeline) {
    const at = toTime(t.createdAt);
    if (at == null || isBotLogin(t.actor)) continue;
    lastActivity = maxTime(lastActivity, at);
    if (sameLogin(t.actor, me)) lastMine = maxTime(lastMine, at);
  }

  let mentionedAfterMine: ActivityFacts["mentionedAfterMine"] = null;
  for (const e of entries) {
    if (!sameLogin(e.actor, me) && mentions(e.body, me) && (lastMine == null || e.at > lastMine)) {
      mentionedAfterMine = { actor: e.actor, at: e.at };
    }
  }
  if (
    !mentionedAfterMine &&
    !sameLogin(s.author, me) &&
    mentions(s.body, me) &&
    lastMine == null &&
    created != null
  ) {
    mentionedAfterMine = { actor: s.author ?? "someone", at: created };
  }

  return {
    lastActivityAt: lastActivity,
    lastMaintainerActivityAt: lastMaintainer,
    lastMyActivityAt: lastMine,
    lastOtherActivityAt: lastOther,
    lastOtherActor,
    lastOtherIsMaintainer,
    firstResponseAt: firstResponse,
    mentionedAfterMine,
  };
}
