import type {
  CheckSnapshot,
  CommentSnapshot,
  ItemKind,
  ItemSnapshot,
  ItemState,
  LabelRef,
  LinkedRefSnapshot,
  PrSnapshot,
  Relation,
  RepoSnapshot,
  ReviewSnapshot,
  TimelineSnapshot,
} from "../types";

export const DEMO_ME = "vidhisingh24";

export interface DemoRepo {
  owner: string;
  name: string;
  description: string;
  stars: number;
  language: string;
  languageColor: string;
  permission?: "ADMIN" | "READ" | "WRITE";
}

type Assoc =
  | "OWNER"
  | "MEMBER"
  | "COLLABORATOR"
  | "CONTRIBUTOR"
  | "NONE"
  | "FIRST_TIME_CONTRIBUTOR";

export interface DemoSpec {
  repo: string;
  kind: ItemKind;
  number: number;
  title: string;
  body?: string;
  author?: string;
  authorAssoc?: Assoc;
  state?: ItemState;
  stateReason?: string;
  /** hours ago */
  created: number;
  updated?: number;
  closed?: number;
  merged?: number;
  mergedBy?: string;
  draft?: boolean;
  labels?: string[];
  assignees?: string[];
  comments?: [author: string, assoc: Assoc, hoursAgo: number, body: string][];
  reviews?: [
    author: string,
    assoc: Assoc,
    state: ReviewSnapshot["state"],
    hoursAgo: number,
    body?: string,
  ][];
  requests?: string[];
  checks?: [
    name: string,
    result: "SUCCESS" | "FAILURE" | "PENDING" | "SKIPPED" | "CANCELLED",
    hoursAgo?: number,
  ][];
  mergeable?: PrSnapshot["mergeable"];
  threads?: [unresolved: number, total: number];
  closes?: number[];
  additions?: number;
  deletions?: number;
  files?: number;
  base?: string;
  head?: string;
  relations?: Relation[];
  /** Overrides for the earlier snapshot so the diff engine produces realistic events. */
  before?: {
    checks?: DemoSpec["checks"];
    mergeable?: PrSnapshot["mergeable"];
    requests?: string[];
    draft?: boolean;
    labels?: string[];
    assignees?: string[];
  };
}

const LABEL_COLORS: Record<string, string> = {
  bug: "d73a4a",
  enhancement: "a2eeef",
  documentation: "0075ca",
  "good first issue": "7057ff",
  "help wanted": "008672",
  "needs review": "fbca04",
  "area/kubectl": "0e8a16",
  "kind/bug": "e11d21",
  "kind/feature": "c7def8",
  "sig/cli": "d2b48c",
  lgtm: "15dd18",
  "size/S": "009900",
  "size/M": "eebb00",
  "size/L": "ee9900",
  tests: "bfd4f2",
  ui: "f9d0c4",
  performance: "5319e7",
  "type: fix": "ee0701",
  "type: feature": "84b6eb",
  "status: needs triage": "ededed",
  "pkg: instrumentation-http": "c5def5",
  "hacktoberfest-accepted": "ff7518",
  chore: "cfd3d7",
  "lfx-mentorship": "1d76db",
  gsoc: "fbca04",
};

export function hoursAgo(now: Date, h: number): string {
  return new Date(now.getTime() - h * 3_600_000).toISOString();
}

const nid = (prefix: string, key: string) => `${prefix}_demo_${key.replace(/[^a-z0-9]/gi, "")}`;

export function repoSnapshot(r: DemoRepo): RepoSnapshot {
  const full = `${r.owner}/${r.name}`;
  return {
    id: nid("R", full),
    owner: r.owner,
    name: r.name,
    fullName: full,
    description: r.description,
    stars: r.stars,
    language: r.language,
    languageColor: r.languageColor,
    defaultBranch: "main",
    isFork: false,
    isArchived: false,
    isPrivate: false,
    url: `https://github.com/${full}`,
    ownerAvatarUrl: null,
    viewerPermission: r.permission ?? "READ",
  };
}

export function itemId(repo: string, kind: ItemKind, number: number): string {
  return nid(kind === "pr" ? "PR" : kind === "issue" ? "I" : "D", `${repo}_${number}`);
}

function labelRefs(names: string[] = []): LabelRef[] {
  return names.map((name) => ({ name, color: LABEL_COLORS[name] ?? "ededed" }));
}

export function buildSnapshot(
  spec: DemoSpec,
  repos: Record<string, DemoRepo>,
  all: DemoSpec[],
  now: Date,
  /** Build the state as it was `cutoffHours` ago (for generating realistic diffs). */
  cutoffHours = 0,
): ItemSnapshot | null {
  if (spec.created < cutoffHours) return null;
  const repo = repos[spec.repo];
  if (!repo) throw new Error(`unknown demo repo ${spec.repo}`);
  const repoSnap = repoSnapshot(repo);
  const t = (h: number) => hoursAgo(now, h);
  const visible = (h: number) => h >= cutoffHours;
  const past = cutoffHours > 0;
  const author = spec.author ?? DEMO_ME;

  let state: ItemState = spec.state ?? "open";
  if (state === "merged" && spec.merged != null && !visible(spec.merged)) state = "open";
  if (state === "closed" && spec.closed != null && !visible(spec.closed)) state = "open";

  const comments: CommentSnapshot[] = (spec.comments ?? [])
    .filter(([, , h]) => visible(h))
    .map(([who, assoc, h, body], i) => ({
      id: nid("IC", `${spec.repo}_${spec.number}_${i}`),
      author: who,
      authorAvatarUrl: null,
      authorAssociation: assoc,
      isBot: who.endsWith("[bot]"),
      body,
      createdAt: t(h),
      url: `${repoSnap.url}/${spec.kind === "pr" ? "pull" : "issues"}/${spec.number}#issuecomment-${1000 + i}`,
    }));

  const reviews: ReviewSnapshot[] = (spec.reviews ?? [])
    .filter(([, , , h]) => visible(h))
    .map(([who, assoc, st, h, body], i) => ({
      id: nid("PRR", `${spec.repo}_${spec.number}_${i}`),
      author: who,
      authorAvatarUrl: null,
      authorAssociation: assoc,
      state: st,
      submittedAt: t(h),
      body: body ?? "",
      url: `${repoSnap.url}/pull/${spec.number}#pullrequestreview-${2000 + i}`,
    }));

  const checkSpec = past && spec.before?.checks ? spec.before.checks : spec.checks;
  const checks: CheckSnapshot[] = (checkSpec ?? []).map(([name, result, h], i) => ({
    id: `CR_${i}`,
    name,
    kind: "check_run",
    status: result === "PENDING" ? "IN_PROGRESS" : "COMPLETED",
    conclusion: result === "PENDING" ? null : result,
    url: `${repoSnap.url}/actions/runs/${9_000_000 + spec.number * 10 + i}`,
    completedAt: result === "PENDING" ? null : t(Math.max(h ?? 1, cutoffHours)),
  }));

  const ref = (n: number, kindWanted: ItemKind | "any"): LinkedRefSnapshot | null => {
    const other = all.find(
      (o) =>
        o.repo === spec.repo && o.number === n && (kindWanted === "any" || o.kind === kindWanted),
    );
    if (!other) return null;
    const otherState: ItemState =
      other.state === "merged" && other.merged != null && !visible(other.merged)
        ? "open"
        : (other.state ?? "open");
    return {
      id: itemId(other.repo, other.kind, other.number),
      number: other.number,
      title: other.title,
      url: `${repoSnap.url}/${other.kind === "pr" ? "pull" : "issues"}/${other.number}`,
      repo: repoSnap.fullName,
      kind: other.kind,
      state: otherState,
      author: other.author ?? DEMO_ME,
      isDraft: other.draft ?? false,
    };
  };

  const closedByPrs: LinkedRefSnapshot[] =
    spec.kind === "pr"
      ? []
      : all
          .filter(
            (o) =>
              o.kind === "pr" &&
              o.repo === spec.repo &&
              o.closes?.includes(spec.number) &&
              visible(o.created),
          )
          .map((o) => ref(o.number, "pr"))
          .filter((x): x is LinkedRefSnapshot => x !== null);

  const timeline: TimelineSnapshot[] = [];
  const assignees = past && spec.before?.assignees ? spec.before.assignees : (spec.assignees ?? []);
  if (assignees.length) {
    timeline.push({
      id: nid("AE", `${spec.repo}_${spec.number}`),
      type: "AssignedEvent",
      actor: null,
      createdAt: t(spec.created - 1),
      detail: assignees.join(","),
    });
  }

  const activity = [
    spec.created,
    ...comments.map((c) => (now.getTime() - Date.parse(c.createdAt)) / 3_600_000),
    ...reviews.map((r) => (now.getTime() - Date.parse(r.submittedAt ?? "")) / 3_600_000),
  ];
  const updatedH = Math.max(cutoffHours, Math.min(spec.updated ?? Infinity, ...activity));

  const pr: PrSnapshot | null =
    spec.kind === "pr"
      ? {
          baseRef: spec.base ?? "main",
          headRef:
            spec.head ??
            `${author}/${spec.title
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .slice(0, 32)}`,
          additions: spec.additions ?? 40 + ((spec.number * 7) % 160),
          deletions: spec.deletions ?? 3 + ((spec.number * 3) % 40),
          changedFiles: spec.files ?? 1 + (spec.number % 9),
          mergeable: (past ? spec.before?.mergeable : undefined) ?? spec.mergeable ?? "MERGEABLE",
          mergeStateStatus: null,
          reviewDecision: (() => {
            const latest = new Map<string, ReviewSnapshot["state"]>();
            for (const r of reviews) if (r.state !== "COMMENTED") latest.set(r.author, r.state);
            const states = [...latest.values()];
            if (states.includes("CHANGES_REQUESTED")) return "CHANGES_REQUESTED";
            if (states.includes("APPROVED")) return "APPROVED";
            return (spec.requests?.length ?? 0) > 0 ? "REVIEW_REQUIRED" : null;
          })(),
          reviewRequests: ((past ? spec.before?.requests : undefined) ?? spec.requests ?? []).map(
            (login) => ({ login, kind: "user" as const, avatarUrl: null }),
          ),
          unresolvedThreads: past ? 0 : (spec.threads?.[0] ?? 0),
          totalThreads: past ? 0 : (spec.threads?.[1] ?? 0),
          headSha: `${(spec.number * 2654435761).toString(16).slice(0, 7)}${past ? "a" : "b"}`,
          rollupState: null,
          checks,
          reviews,
          closingIssues: (spec.closes ?? [])
            .map((n) => ref(n, "issue"))
            .filter((x): x is LinkedRefSnapshot => x !== null),
        }
      : null;

  return {
    id: itemId(spec.repo, spec.kind, spec.number),
    kind: spec.kind,
    repo: repoSnap,
    number: spec.number,
    title: spec.title,
    body: spec.body ?? "",
    state,
    stateReason:
      state === "closed"
        ? (spec.stateReason ?? (spec.kind === "issue" ? "COMPLETED" : null))
        : null,
    isDraft: past && spec.before?.draft != null ? spec.before.draft : (spec.draft ?? false),
    isLocked: false,
    author,
    authorAvatarUrl: null,
    authorAssociation: spec.authorAssoc ?? (author === DEMO_ME ? "CONTRIBUTOR" : "MEMBER"),
    createdAt: t(spec.created),
    updatedAt: t(updatedH),
    closedAt:
      state === "closed" && spec.closed != null
        ? t(spec.closed)
        : state === "merged" && spec.merged != null
          ? t(spec.merged)
          : null,
    mergedAt: state === "merged" && spec.merged != null ? t(spec.merged) : null,
    mergedBy: state === "merged" ? (spec.mergedBy ?? "maintainer") : null,
    labels: labelRefs(past && spec.before?.labels ? spec.before.labels : spec.labels),
    assignees,
    milestone: null,
    commentsCount: comments.length,
    url: `${repoSnap.url}/${spec.kind === "pr" ? "pull" : spec.kind === "issue" ? "issues" : "discussions"}/${spec.number}`,
    comments,
    timeline,
    closedByPrs,
    participants: [
      ...new Set([author, ...comments.map((c) => c.author), ...reviews.map((r) => r.author)]),
    ],
    pr,
  };
}
