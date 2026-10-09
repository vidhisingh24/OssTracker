import type { Relation } from "../types";

export interface SearchSpec {
  q: string;
  type: "ISSUE" | "DISCUSSION";
  relation: Relation;
}

export function buildSearchQueries(
  me: string,
  opts: {
    excludeOwnRepos?: boolean;
    excludedRepos?: string[];
    excludedOrgs?: string[];
    scope?: "full" | "incremental";
  } = {},
): SearchSpec[] {
  const suffix = [
    opts.excludeOwnRepos ? `-user:${me}` : "",
    ...(opts.excludedRepos ?? []).map((r) => `-repo:${r}`),
    ...(opts.excludedOrgs ?? []).map((o) => `-org:${o}`),
  ]
    .filter(Boolean)
    .join(" ");
  const q = (s: string) => `${s} ${suffix}`.trim();
  const full: SearchSpec[] = [
    { q: q(`is:pr author:${me}`), type: "ISSUE", relation: "author" },
    { q: q(`is:issue author:${me}`), type: "ISSUE", relation: "author" },
    { q: q(`involves:${me}`), type: "ISSUE", relation: "involved" },
    { q: q(`commenter:${me}`), type: "ISSUE", relation: "commenter" },
    { q: q(`reviewed-by:${me}`), type: "ISSUE", relation: "reviewer" },
    { q: q(`review-requested:${me}`), type: "ISSUE", relation: "review_requested" },
    { q: q(`assignee:${me}`), type: "ISSUE", relation: "assignee" },
    { q: q(`mentions:${me}`), type: "ISSUE", relation: "mentioned" },
    { q: q(`author:${me}`), type: "DISCUSSION", relation: "author" },
    { q: q(`commenter:${me}`), type: "DISCUSSION", relation: "commenter" },
  ];
  if (opts.scope === "incremental")
    return full.filter(
      (s) => ["involved", "review_requested", "author"].includes(s.relation) && s.type === "ISSUE",
    );
  return full;
}

const SEARCH_CAP = 1000;
const DAY = 86_400_000;

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Split [from, to] into date windows each holding < 1000 results (GitHub search cap), by
 * recursive halving. `count` returns issueCount for a window. Windows are inclusive days.
 */
export async function partitionWindows(
  from: Date,
  to: Date,
  count: (from: Date, to: Date) => Promise<number>,
  depth = 0,
): Promise<{ from: Date; to: Date; count: number }[]> {
  const n = await count(from, to);
  if (n === 0) return [];
  const spanDays = Math.floor((to.getTime() - from.getTime()) / DAY);
  if (n < SEARCH_CAP || spanDays < 1 || depth > 12) return [{ from, to, count: n }];
  const mid = new Date(from.getTime() + Math.floor(spanDays / 2) * DAY);
  const left = await partitionWindows(from, mid, count, depth + 1);
  const right = await partitionWindows(new Date(mid.getTime() + DAY), to, count, depth + 1);
  return [...left, ...right];
}

export function windowQualifier(from: Date, to: Date): string {
  return `updated:${isoDay(from)}..${isoDay(to)}`;
}

/** Split ids into GraphQL-friendly batches. */
export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
