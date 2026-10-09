import { describe, expect, it } from "vitest";
import {
  computeAttention,
  deriveBall,
  deriveCiState,
  deriveStage,
  diffSnapshots,
  needsYou,
  syncAttentionReasons,
} from "../src/derive";
import { backoffDelay, retryAfterMs } from "../src/github/client";
import { partitionWindows } from "../src/sync/discovery";
import { decryptSecret, encryptSecret, verifyWebhookSignature } from "../src/lib/crypto";
import type { ItemSnapshot } from "../src/types";
import { createHmac } from "node:crypto";

const NOW = new Date("2026-10-09T12:00:00Z");
const ME = "vidhisingh24";
const h = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();

function pr(
  over: Partial<ItemSnapshot> = {},
  prOver: Partial<NonNullable<ItemSnapshot["pr"]>> = {},
): ItemSnapshot {
  return {
    id: "PR_1",
    kind: "pr",
    repo: {
      id: "R",
      owner: "o",
      name: "r",
      fullName: "o/r",
      description: null,
      stars: 0,
      language: null,
      languageColor: null,
      defaultBranch: "main",
      isFork: false,
      isArchived: false,
      isPrivate: false,
      url: "https://github.com/o/r",
      ownerAvatarUrl: null,
      viewerPermission: "READ",
    },
    number: 1,
    title: "t",
    body: "",
    state: "open",
    stateReason: null,
    isDraft: false,
    isLocked: false,
    author: ME,
    authorAvatarUrl: null,
    authorAssociation: "CONTRIBUTOR",
    createdAt: h(48),
    updatedAt: h(2),
    closedAt: null,
    mergedAt: null,
    mergedBy: null,
    labels: [],
    assignees: [],
    milestone: null,
    commentsCount: 0,
    url: "https://github.com/o/r/pull/1",
    comments: [],
    timeline: [],
    closedByPrs: [],
    participants: [],
    pr: {
      baseRef: "main",
      headRef: "f",
      additions: 1,
      deletions: 1,
      changedFiles: 1,
      mergeable: "MERGEABLE",
      mergeStateStatus: null,
      reviewDecision: null,
      reviewRequests: [],
      unresolvedThreads: 0,
      totalThreads: 0,
      headSha: "abc",
      rollupState: null,
      checks: [],
      reviews: [],
      closingIssues: [],
      ...prOver,
    },
    ...over,
  };
}
const ctx = { me: ME, now: NOW };
const check = (conclusion: string | null) => ({
  id: "c",
  name: "test",
  kind: "check_run" as const,
  status: conclusion ? "COMPLETED" : "IN_PROGRESS",
  conclusion,
  url: null,
  completedAt: null,
});

describe("CI rollup", () => {
  it("failing beats passing", () =>
    expect(deriveCiState(pr({}, { checks: [check("SUCCESS"), check("FAILURE")] }).pr)).toBe(
      "failing",
    ));
  it("pending when running", () =>
    expect(deriveCiState(pr({}, { checks: [check("SUCCESS"), check(null)] }).pr)).toBe("pending"));
  it("none without checks", () => expect(deriveCiState(pr().pr)).toBe("none"));
});

describe("stage", () => {
  it("open PR without reviews", () => expect(deriveStage(pr(), ctx)).toBe("pr_open"));
  it("draft", () => expect(deriveStage(pr({ isDraft: true }), ctx)).toBe("pr_draft"));
  it("changes requested", () =>
    expect(deriveStage(pr({}, { reviewDecision: "CHANGES_REQUESTED" }), ctx)).toBe(
      "changes_requested",
    ));
  it("merged", () => expect(deriveStage(pr({ state: "merged" }), ctx)).toBe("merged"));
  it("stale after threshold", () =>
    expect(deriveStage(pr({ createdAt: h(24 * 30), updatedAt: h(24 * 20) }), ctx)).toBe("stale"));
  it("review requests → in review", () =>
    expect(deriveStage(pr({}, { reviewRequests: [{ login: "m", kind: "user" }] }), ctx)).toBe(
      "in_review",
    ));
});

describe("ball in court", () => {
  it("failing CI on my PR is mine", () =>
    expect(deriveBall(pr({}, { checks: [check("FAILURE")] }), ctx)).toBe("you"));
  it("conflict is mine", () =>
    expect(deriveBall(pr({}, { mergeable: "CONFLICTING" }), ctx)).toBe("you"));
  it("pending CI waits on CI", () =>
    expect(deriveBall(pr({}, { checks: [check(null)] }), ctx)).toBe("ci"));
  it("clean PR waits on maintainers", () => expect(deriveBall(pr(), ctx)).toBe("maintainer"));
  it("review requested from me", () =>
    expect(
      deriveBall(pr({ author: "other" }, { reviewRequests: [{ login: ME, kind: "user" }] }), ctx),
    ).toBe("you"));
  it("closed → nobody", () => expect(deriveBall(pr({ state: "closed" }), ctx)).toBe("nobody"));
});

describe("attention", () => {
  it("ranks failing CI + changes requested", () => {
    const reasons = syncAttentionReasons(
      pr({}, { checks: [check("FAILURE")], reviewDecision: "CHANGES_REQUESTED" }),
      ctx,
    );
    expect(reasons.map((r) => r.code).sort()).toEqual(["changes_requested", "ci_failed"]);
    expect(
      computeAttention({ state: "open", syncReasons: reasons }, {}, NOW).score,
    ).toBeGreaterThan(90);
  });
  it("snooze zeroes the score", () => {
    const reasons = syncAttentionReasons(pr({}, { checks: [check("FAILURE")] }), ctx);
    expect(
      computeAttention({ state: "open", syncReasons: reasons }, { snoozedUntil: h(-5) }, NOW).score,
    ).toBe(0);
  });
  it("overdue due date adds a reason", () => {
    const res = computeAttention(
      { state: "open", syncReasons: [] },
      { dueAt: h(3), priority: "P0" },
      NOW,
    );
    expect(res.reasons[0]?.code).toBe("overdue");
    expect(res.score).toBe(90);
  });
  it("suggests a ping when maintainers are silent", () => {
    const reasons = syncAttentionReasons(pr({ createdAt: h(24 * 10), updatedAt: h(24 * 10) }), {
      ...ctx,
      stale: { prDays: 30, issueDays: 30, pingAfterDays: 7 },
    });
    expect(reasons.map((r) => r.code)).toContain("stale_ping");
    expect(needsYou(reasons)).toBe(false);
  });
  it("maintainer reply after mine → new_reply", () => {
    const s = pr({
      comments: [
        {
          id: "c1",
          author: "maint",
          authorAvatarUrl: null,
          authorAssociation: "MEMBER",
          isBot: false,
          body: "please fix",
          createdAt: h(1),
          url: null,
        },
      ],
    });
    expect(syncAttentionReasons(s, ctx).map((r) => r.code)).toContain("new_reply");
  });
});

describe("event diffing", () => {
  it("first sight emits discovered only", () => {
    expect(diffSnapshots(null, pr(), { me: ME, now: NOW }).map((e) => e.type)).toEqual([
      "discovered",
    ]);
  });
  it("detects ci_failed, review, merge and is deterministic", () => {
    const before = pr({}, { checks: [check("SUCCESS")] });
    const after = pr(
      { state: "merged", mergedAt: h(0.5), mergedBy: "m" },
      {
        checks: [check("FAILURE")],
        reviews: [
          {
            id: "r1",
            author: "m",
            authorAvatarUrl: null,
            authorAssociation: "MEMBER",
            state: "CHANGES_REQUESTED",
            submittedAt: h(1),
            body: "",
            url: null,
          },
        ],
      },
    );
    const a = diffSnapshots(before, after, { me: ME, now: NOW });
    const b = diffSnapshots(before, after, { me: ME, now: NOW });
    expect(a.map((e) => e.type).sort()).toEqual(["changes_requested", "ci_failed", "merged"]);
    expect(a.map((e) => e.dedupeKey)).toEqual(b.map((e) => e.dedupeKey));
    expect(a.find((e) => e.type === "ci_failed")?.priority).toBe("high");
  });
  it("ignores my own comments", () => {
    const after = pr({
      comments: [
        {
          id: "c",
          author: ME,
          authorAvatarUrl: null,
          authorAssociation: "CONTRIBUTOR",
          isBot: false,
          body: "x",
          createdAt: h(1),
          url: null,
        },
      ],
    });
    expect(diffSnapshots(pr(), after, { me: ME, now: NOW })).toEqual([]);
  });
});

describe("rate limiting", () => {
  it("backoff grows and is capped", () => {
    expect(backoffDelay(0, { random: () => 1 })).toBe(500);
    expect(backoffDelay(3, { random: () => 0 })).toBe(2000);
    expect(backoffDelay(20, { random: () => 1 })).toBe(30_000);
  });
  it("honours Retry-After", () =>
    expect(retryAfterMs(new Headers({ "retry-after": "12" }))).toBe(12_000));
  it("uses reset time when exhausted", () => {
    const now = 1_000_000_000_000;
    expect(
      retryAfterMs(
        new Headers({ "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(now / 1000 + 30) }),
        now,
      ),
    ).toBe(30_000);
  });
});

describe("search window partitioning", () => {
  it("splits windows until each is under the 1000 cap", async () => {
    const DAY = 86_400_000;
    const from = new Date("2024-01-01T00:00:00Z");
    const to = new Date(from.getTime() + 100 * DAY);
    // 30 results per day → 3000 total
    const count = async (a: Date, b: Date) =>
      Math.round(((b.getTime() - a.getTime()) / DAY + 1) * 30);
    const windows = await partitionWindows(from, to, count);
    expect(windows.length).toBeGreaterThan(2);
    expect(windows.every((w) => w.count < 1000)).toBe(true);
    expect(windows.reduce((s, w) => s + w.count, 0)).toBeGreaterThanOrEqual(3000);
  });
  it("skips empty ranges", async () =>
    expect(await partitionWindows(new Date(0), new Date(86_400_000 * 10), async () => 0)).toEqual(
      [],
    ));
});

describe("crypto", () => {
  const key = Buffer.alloc(32, 7).toString("base64");
  it("round-trips AES-256-GCM", () => {
    const c = encryptSecret("gho_secret", key);
    expect(c).not.toContain("gho_secret");
    expect(decryptSecret(c, key)).toBe("gho_secret");
  });
  it("rejects tampering", () => {
    const c = encryptSecret("x", key);
    expect(() => decryptSecret(`${c.slice(0, -2)}AA`, key)).toThrow();
  });
  it("verifies webhook HMAC", () => {
    const sig = `sha256=${createHmac("sha256", "s").update("body").digest("hex")}`;
    expect(verifyWebhookSignature("body", sig, "s")).toBe(true);
    expect(verifyWebhookSignature("body", sig, "t")).toBe(false);
  });
});
