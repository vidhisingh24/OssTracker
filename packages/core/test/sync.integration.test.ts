import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { eq } from "drizzle-orm";
import { migrateDb, openDb } from "../src/db/client";
import { itemEvents, items, notifications, userMeta } from "../src/db/schema";
import { GitHubClient } from "../src/github/client";
import { runSync } from "../src/sync/engine";
import { getToday, updateItemMeta } from "../src/db/queries";

const ME = "vidhisingh24";
const repo = {
  id: "R_1",
  name: "proj",
  nameWithOwner: "acme/proj",
  url: "https://github.com/acme/proj",
  description: "d",
  stargazerCount: 5,
  isFork: false,
  isArchived: false,
  isPrivate: false,
  viewerPermission: "READ",
  owner: { login: "acme", avatarUrl: null },
  primaryLanguage: { name: "TypeScript", color: "#3178c6" },
  defaultBranchRef: { name: "main" },
};

let ciConclusion = "SUCCESS";
const prNode = () => ({
  __typename: "PullRequest",
  id: "PR_1",
  number: 7,
  title: "feat: thing",
  body: "",
  state: "OPEN",
  isDraft: false,
  locked: false,
  url: "https://github.com/acme/proj/pull/7",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-08T00:00:00Z",
  closedAt: null,
  mergedAt: null,
  mergedBy: null,
  author: { login: ME, avatarUrl: null, __typename: "User" },
  authorAssociation: "CONTRIBUTOR",
  repository: repo,
  labels: { nodes: [{ name: "enhancement", color: "a2eeef" }] },
  assignees: { nodes: [] },
  milestone: null,
  participants: { nodes: [] },
  comments: { totalCount: 0, nodes: [] },
  baseRefName: "main",
  headRefName: "feat",
  additions: 3,
  deletions: 1,
  changedFiles: 1,
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
  reviewDecision: null,
  reviewRequests: { nodes: [] },
  latestReviews: { nodes: [] },
  reviews: { nodes: [] },
  reviewThreads: { totalCount: 0, nodes: [] },
  commits: {
    nodes: [
      {
        commit: {
          oid: "abc",
          statusCheckRollup: {
            state: ciConclusion === "SUCCESS" ? "SUCCESS" : "FAILURE",
            contexts: {
              nodes: [
                {
                  __typename: "CheckRun",
                  id: "CR1",
                  name: "test",
                  status: "COMPLETED",
                  conclusion: ciConclusion,
                  detailsUrl: "https://ci",
                  completedAt: "2026-10-08T00:00:00Z",
                },
              ],
            },
          },
        },
      },
    ],
  },
  closingIssuesReferences: { nodes: [] },
  timelineItems: { nodes: [] },
});
const rate = { cost: 1, remaining: 4990, resetAt: "2026-10-09T13:00:00Z", limit: 5000, used: 10 };

const server = setupServer(
  http.post("https://api.github.com/graphql", async ({ request }) => {
    const body = (await request.json()) as { query: string };
    if (body.query.includes("search(")) {
      return HttpResponse.json({
        data: {
          rateLimit: rate,
          search: {
            issueCount: 1,
            discussionCount: 0,
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [{ __typename: "PullRequest", id: "PR_1", updatedAt: "2026-10-08T00:00:00Z" }],
          },
        },
      });
    }
    if (body.query.includes("nodes(ids"))
      return HttpResponse.json({ data: { rateLimit: rate, nodes: [prNode()] } });
    return HttpResponse.json({ data: { rateLimit: rate } });
  }),
  http.get("https://api.github.com/notifications", ({ request }) => {
    if (request.headers.get("if-modified-since"))
      return new HttpResponse(null, { status: 304, headers: { "X-Poll-Interval": "60" } });
    return HttpResponse.json(
      [
        {
          id: "55",
          reason: "author",
          unread: true,
          updated_at: "2026-10-08T00:00:00Z",
          last_read_at: null,
          subject: {
            title: "feat: thing",
            url: "https://api.github.com/repos/acme/proj/pulls/7",
            type: "PullRequest",
          },
          repository: { full_name: "acme/proj", html_url: "https://github.com/acme/proj" },
        },
      ],
      { headers: { "Last-Modified": "Wed, 08 Oct 2026 00:00:00 GMT", "X-Poll-Interval": "90" } },
    );
  }),
);

const handle = openDb({ pgliteDir: "memory://" });
const db = handle.db;
const client = () => new GitHubClient({ token: "test", sleep: async () => undefined });

beforeAll(async () => {
  server.listen({ onUnhandledRequest: "error" });
  await migrateDb(handle);
});
afterAll(async () => {
  server.close();
  await handle.close();
});

describe("full sync against GitHub fixtures", () => {
  it("discovers, hydrates and derives", async () => {
    const res = await runSync(db, "cold", {
      client: client(),
      me: ME,
      now: new Date("2026-10-09T00:00:00Z"),
    });
    expect(res.status).toBe("success");
    const [row] = await db.select().from(items).where(eq(items.id, "PR_1"));
    expect(row?.ciState).toBe("passing");
    expect(row?.ball).toBe("maintainer");
    expect(row?.myRelation).toContain("author");
  });

  it("is idempotent and emits ci_failed on change, never touching user_meta", async () => {
    await updateItemMeta(db, "PR_1", { notes: "my note", priority: "P1" });
    await runSync(db, "hot", { client: client(), me: ME, now: new Date("2026-10-09T01:00:00Z") });
    ciConclusion = "FAILURE";
    await runSync(db, "hot", { client: client(), me: ME, now: new Date("2026-10-09T02:00:00Z") });
    await runSync(db, "hot", { client: client(), me: ME, now: new Date("2026-10-09T03:00:00Z") });
    const events = await db.select().from(itemEvents).where(eq(itemEvents.type, "ci_failed"));
    expect(events).toHaveLength(1);
    const [meta] = await db.select().from(userMeta).where(eq(userMeta.itemId, "PR_1"));
    expect(meta?.notes).toBe("my note");
    const today = await getToday(db, { now: new Date("2026-10-09T03:00:00Z") });
    expect(today.needsYou[0]?.attentionReasons[0]?.code).toBe("ci_failed");
  });

  it("polls notifications with conditional requests", async () => {
    const first = await runSync(db, "notifications", { client: client(), me: ME });
    expect(first.pollInterval).toBe(90);
    const n = await db.select().from(notifications);
    expect(n[0]?.itemId).toBe("PR_1");
    const second = await runSync(db, "notifications", { client: client(), me: ME });
    expect(second.status).toBe("success");
    expect(second.pollInterval).toBe(60);
  });
});
