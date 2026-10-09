import { z } from "zod";
import type {
  CheckSnapshot,
  ItemSnapshot,
  LinkedRefSnapshot,
  RepoSnapshot,
  ReviewSnapshot,
  TimelineSnapshot,
} from "../types";
import { isBotLogin } from "../derive/util";

const actor = z
  .object({ login: z.string(), avatarUrl: z.string().nullish(), __typename: z.string().nullish() })
  .nullish();
const conn = <T extends z.ZodType>(node: T) =>
  z
    .object({ totalCount: z.number().nullish(), nodes: z.array(node.nullable()).nullish() })
    .nullish();

const repoSchema = z.object({
  id: z.string(),
  name: z.string(),
  nameWithOwner: z.string(),
  url: z.string(),
  description: z.string().nullish(),
  stargazerCount: z.number().nullish(),
  isFork: z.boolean().nullish(),
  isArchived: z.boolean().nullish(),
  isPrivate: z.boolean().nullish(),
  viewerPermission: z.string().nullish(),
  owner: z.object({ login: z.string(), avatarUrl: z.string().nullish() }),
  primaryLanguage: z.object({ name: z.string(), color: z.string().nullish() }).nullish(),
  defaultBranchRef: z.object({ name: z.string() }).nullish(),
});

const commentSchema = z.object({
  id: z.string(),
  author: actor,
  authorAssociation: z.string().nullish(),
  body: z.string().nullish(),
  createdAt: z.string(),
  url: z.string().nullish(),
});
const reviewSchema = z.object({
  id: z.string(),
  state: z.string(),
  submittedAt: z.string().nullish(),
  body: z.string().nullish(),
  url: z.string().nullish(),
  authorAssociation: z.string().nullish(),
  author: actor,
});
const linkedSchema = z.object({
  id: z.string(),
  number: z.number(),
  title: z.string(),
  url: z.string(),
  state: z.string(),
  isDraft: z.boolean().nullish(),
  author: actor,
  repository: z.object({ nameWithOwner: z.string() }),
});
const timelineSchema = z.object({
  __typename: z.string(),
  id: z.string().nullish(),
  createdAt: z.string().nullish(),
  actor: actor,
  label: z.object({ name: z.string() }).nullish(),
  assignee: z.object({ login: z.string().nullish() }).nullish(),
});
const contextSchema = z.object({
  __typename: z.string(),
  id: z.string().nullish(),
  name: z.string().nullish(),
  status: z.string().nullish(),
  conclusion: z.string().nullish(),
  detailsUrl: z.string().nullish(),
  completedAt: z.string().nullish(),
  context: z.string().nullish(),
  state: z.string().nullish(),
  targetUrl: z.string().nullish(),
  createdAt: z.string().nullish(),
});

const common = {
  id: z.string(),
  number: z.number(),
  title: z.string(),
  body: z.string().nullish(),
  url: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  closedAt: z.string().nullish(),
  locked: z.boolean().nullish(),
  author: actor,
  authorAssociation: z.string().nullish(),
  repository: repoSchema,
  labels: conn(z.object({ name: z.string(), color: z.string().nullish() })),
  assignees: conn(z.object({ login: z.string() })),
  milestone: z.object({ title: z.string() }).nullish(),
  participants: conn(z.object({ login: z.string() })),
  comments: conn(commentSchema),
};

export const prNodeSchema = z.object({
  __typename: z.literal("PullRequest"),
  ...common,
  state: z.string(),
  isDraft: z.boolean().nullish(),
  mergedAt: z.string().nullish(),
  mergedBy: actor,
  baseRefName: z.string().nullish(),
  headRefName: z.string().nullish(),
  additions: z.number().nullish(),
  deletions: z.number().nullish(),
  changedFiles: z.number().nullish(),
  mergeable: z.string().nullish(),
  mergeStateStatus: z.string().nullish(),
  reviewDecision: z.string().nullish(),
  reviewRequests: conn(
    z.object({
      requestedReviewer: z
        .object({
          __typename: z.string(),
          login: z.string().nullish(),
          slug: z.string().nullish(),
          avatarUrl: z.string().nullish(),
        })
        .nullish(),
    }),
  ),
  latestReviews: conn(reviewSchema),
  reviews: conn(reviewSchema),
  reviewThreads: conn(z.object({ isResolved: z.boolean() })),
  commits: conn(
    z.object({
      commit: z.object({
        oid: z.string(),
        statusCheckRollup: z
          .object({ state: z.string().nullish(), contexts: conn(contextSchema) })
          .nullish(),
      }),
    }),
  ),
  closingIssuesReferences: conn(linkedSchema),
  timelineItems: conn(timelineSchema),
});

export const issueNodeSchema = z.object({
  __typename: z.literal("Issue"),
  ...common,
  state: z.string(),
  stateReason: z.string().nullish(),
  closedByPullRequestsReferences: conn(linkedSchema),
  timelineItems: conn(timelineSchema),
});

export const discussionNodeSchema = z.object({
  __typename: z.literal("Discussion"),
  ...common,
  closed: z.boolean().nullish(),
});

export const anyNodeSchema = z.discriminatedUnion("__typename", [
  prNodeSchema,
  issueNodeSchema,
  discussionNodeSchema,
]);
export type GitHubNode = z.infer<typeof anyNodeSchema>;

const nodes = <T>(c: { nodes?: (T | null)[] | null } | null | undefined): T[] =>
  (c?.nodes ?? []).filter((n): n is T => n != null);

function repo(r: z.infer<typeof repoSchema>): RepoSnapshot {
  return {
    id: r.id,
    owner: r.owner.login,
    name: r.name,
    fullName: r.nameWithOwner,
    description: r.description ?? null,
    stars: r.stargazerCount ?? 0,
    language: r.primaryLanguage?.name ?? null,
    languageColor: r.primaryLanguage?.color ?? null,
    defaultBranch: r.defaultBranchRef?.name ?? null,
    isFork: !!r.isFork,
    isArchived: !!r.isArchived,
    isPrivate: !!r.isPrivate,
    url: r.url,
    ownerAvatarUrl: r.owner.avatarUrl ?? null,
    viewerPermission: r.viewerPermission ?? null,
  };
}

function linked(l: z.infer<typeof linkedSchema>, kind: "issue" | "pr"): LinkedRefSnapshot {
  const state = l.state === "MERGED" ? "merged" : l.state === "CLOSED" ? "closed" : "open";
  return {
    id: l.id,
    number: l.number,
    title: l.title,
    url: l.url,
    repo: l.repository.nameWithOwner,
    kind,
    state,
    author: l.author?.login ?? null,
    isDraft: !!l.isDraft,
  };
}

function timeline(items: z.infer<typeof timelineSchema>[]): TimelineSnapshot[] {
  return items
    .filter((t) => t.id && t.createdAt)
    .map((t) => ({
      id: t.id!,
      type: t.__typename,
      actor: t.actor?.login ?? null,
      createdAt: t.createdAt!,
      detail: t.label?.name ?? t.assignee?.login ?? null,
    }));
}

function checksFrom(contexts: z.infer<typeof contextSchema>[]): CheckSnapshot[] {
  return contexts.map((c, i) => {
    if (c.__typename === "StatusContext") {
      const st = c.state ?? "PENDING";
      const done = st !== "PENDING" && st !== "EXPECTED";
      return {
        id: c.id ?? `sc${i}`,
        name: c.context ?? "status",
        kind: "status_context" as const,
        status: done ? "COMPLETED" : "PENDING",
        conclusion: done
          ? st === "SUCCESS"
            ? "SUCCESS"
            : st === "ERROR"
              ? "ERROR"
              : "FAILURE"
          : null,
        url: c.targetUrl ?? null,
        completedAt: done ? (c.createdAt ?? null) : null,
      };
    }
    return {
      id: c.id ?? `cr${i}`,
      name: c.name ?? "check",
      kind: "check_run" as const,
      status: c.status ?? "QUEUED",
      conclusion: c.conclusion ?? null,
      url: c.detailsUrl ?? null,
      completedAt: c.completedAt ?? null,
    };
  });
}

/** Validate a raw GraphQL node and map it into the normalized snapshot. Returns null if unrecognized. */
export function normalizeNode(raw: unknown): ItemSnapshot | null {
  const parsed = anyNodeSchema.safeParse(raw);
  if (!parsed.success) return null;
  const n = parsed.data;
  const commentList = nodes(n.comments).map((c) => ({
    id: c.id,
    author: c.author?.login ?? "ghost",
    authorAvatarUrl: c.author?.avatarUrl ?? null,
    authorAssociation: c.authorAssociation ?? null,
    isBot: c.author?.__typename === "Bot" || isBotLogin(c.author?.login),
    body: c.body ?? "",
    createdAt: c.createdAt,
    url: c.url ?? null,
  }));
  const base = {
    id: n.id,
    repo: repo(n.repository),
    number: n.number,
    title: n.title,
    body: n.body ?? "",
    isLocked: !!n.locked,
    author: n.author?.login ?? null,
    authorAvatarUrl: n.author?.avatarUrl ?? null,
    authorAssociation: n.authorAssociation ?? null,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    closedAt: n.closedAt ?? null,
    labels: nodes(n.labels).map((l) => ({ name: l.name, color: l.color ?? "ededed" })),
    assignees: nodes(n.assignees).map((a) => a.login),
    milestone: n.milestone?.title ?? null,
    commentsCount: n.comments?.totalCount ?? commentList.length,
    url: n.url,
    comments: commentList,
    participants: nodes(n.participants).map((p) => p.login),
  };

  if (n.__typename === "PullRequest") {
    const reviewMap = new Map<string, ReviewSnapshot>();
    for (const r of [...nodes(n.reviews), ...nodes(n.latestReviews)]) {
      reviewMap.set(r.id, {
        id: r.id,
        author: r.author?.login ?? "ghost",
        authorAvatarUrl: r.author?.avatarUrl ?? null,
        authorAssociation: r.authorAssociation ?? null,
        state: (["APPROVED", "CHANGES_REQUESTED", "COMMENTED", "DISMISSED", "PENDING"].includes(
          r.state,
        )
          ? r.state
          : "COMMENTED") as ReviewSnapshot["state"],
        submittedAt: r.submittedAt ?? null,
        body: r.body ?? "",
        url: r.url ?? null,
      });
    }
    const commit = nodes(n.commits)[0]?.commit;
    const threads = nodes(n.reviewThreads);
    const state = n.state === "MERGED" ? "merged" : n.state === "CLOSED" ? "closed" : "open";
    return {
      ...base,
      kind: "pr",
      state,
      stateReason: null,
      isDraft: !!n.isDraft,
      mergedAt: n.mergedAt ?? null,
      mergedBy: n.mergedBy?.login ?? null,
      timeline: timeline(nodes(n.timelineItems)),
      closedByPrs: [],
      pr: {
        baseRef: n.baseRefName ?? "",
        headRef: n.headRefName ?? "",
        additions: n.additions ?? 0,
        deletions: n.deletions ?? 0,
        changedFiles: n.changedFiles ?? 0,
        mergeable: (n.mergeable === "MERGEABLE" || n.mergeable === "CONFLICTING"
          ? n.mergeable
          : "UNKNOWN") as "MERGEABLE" | "CONFLICTING" | "UNKNOWN",
        mergeStateStatus: n.mergeStateStatus ?? null,
        reviewDecision: (n.reviewDecision ?? null) as
          | "APPROVED"
          | "CHANGES_REQUESTED"
          | "REVIEW_REQUIRED"
          | null,
        reviewRequests: nodes(n.reviewRequests)
          .map((r) => r.requestedReviewer)
          .filter((r): r is NonNullable<typeof r> => !!r)
          .map((r) => ({
            login: r.login ?? r.slug ?? "team",
            kind:
              r.__typename === "Team"
                ? ("team" as const)
                : r.__typename === "Bot"
                  ? ("bot" as const)
                  : ("user" as const),
            avatarUrl: r.avatarUrl ?? null,
          })),
        unresolvedThreads: threads.filter((t) => !t.isResolved).length,
        totalThreads: n.reviewThreads?.totalCount ?? threads.length,
        headSha: commit?.oid ?? null,
        rollupState: commit?.statusCheckRollup?.state ?? null,
        checks: checksFrom(nodes(commit?.statusCheckRollup?.contexts)),
        reviews: [...reviewMap.values()].sort((a, b) =>
          (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""),
        ),
        closingIssues: nodes(n.closingIssuesReferences).map((l) => linked(l, "issue")),
      },
    };
  }
  if (n.__typename === "Issue") {
    return {
      ...base,
      kind: "issue",
      state: n.state === "CLOSED" ? "closed" : "open",
      stateReason: n.stateReason ?? null,
      isDraft: false,
      mergedAt: null,
      mergedBy: null,
      timeline: timeline(nodes(n.timelineItems)),
      closedByPrs: nodes(n.closedByPullRequestsReferences).map((l) => linked(l, "pr")),
      pr: null,
    };
  }
  return {
    ...base,
    kind: "discussion",
    state: n.closed ? "closed" : "open",
    stateReason: null,
    isDraft: false,
    mergedAt: null,
    mergedBy: null,
    timeline: [],
    closedByPrs: [],
    pr: null,
  };
}
