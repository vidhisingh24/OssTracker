import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@contrib/core/db";
import { schema } from "@contrib/core/db";
import { getEnv } from "@contrib/core/env";
import { logger } from "@contrib/core/logger";
import { GitHubClient, getGithubToken } from "@contrib/core/github";
import { recordRate, resolveNumber, runDemoSync, runSync, type SyncKind } from "@contrib/core/sync";
import { parseGithubUrl } from "@contrib/core/queries";
import { getSettings } from "@contrib/core/db";
import { after } from "next/server";
import { dispatchPending } from "@contrib/core/notify";
import { HttpError } from "./api";

/** Start a sync: demo → simulated; worker mode → queued; inline (Vercel) → runs after the response. */
export async function triggerSync(
  db: Db,
  kind: Exclude<SyncKind, "demo">,
  opts: { itemIds?: string[] } = {},
): Promise<{ runId?: string; queued?: boolean }> {
  const env = getEnv();
  if (env.isDemo) return { runId: await runDemoSync(db, "manual") };
  if (env.syncMode === "worker") {
    const { enqueue } = await import("@contrib/core/queue");
    await enqueue(
      kind === "item" ? "sync.item" : (`sync.${kind}` as "sync.hot"),
      { trigger: "manual", itemIds: opts.itemIds },
      { singletonKey: kind === "item" ? undefined : `manual-${kind}` },
    );
    return { queued: true };
  }
  // `after` keeps the serverless function alive until the sync finishes.
  after(() =>
    runSync(db, kind, { trigger: "manual", itemIds: opts.itemIds })
      .then(() => dispatchPending(db))
      .catch((err: unknown) => logger.error({ err }, "inline sync failed")),
  );
  return { queued: false };
}

/** Add-by-URL: resolve, hydrate immediately and mark as manually tracked. */
export async function trackByUrl(db: Db, url: string): Promise<string> {
  const parsed = parseGithubUrl(url);
  if (!parsed) throw new HttpError(400, "Not a GitHub issue, pull request or discussion URL");
  const slug = `${parsed.owner}/${parsed.name}`;
  const existing = await db
    .select({ id: schema.items.id })
    .from(schema.items)
    .where(
      and(
        sql`lower(${schema.items.repoFullName}) = ${slug.toLowerCase()}`,
        eq(schema.items.number, parsed.number),
      ),
    )
    .limit(1);
  if (existing[0]) return existing[0].id;

  const env = getEnv();
  if (env.isDemo) {
    const { ensureRepoStub } = await import("@contrib/core/sync");
    const repoId = await ensureRepoStub(db, slug);
    const id = `manual_${randomUUID()}`;
    await db.insert(schema.items).values({
      id,
      repoId,
      repoFullName: slug,
      kind: parsed.kind,
      number: parsed.number,
      title: `${slug}#${parsed.number} (added in demo mode)`,
      url: `https://github.com/${slug}/${parsed.kind === "pr" ? "pull" : parsed.kind === "issue" ? "issues" : "discussions"}/${parsed.number}`,
      source: "manual",
      nextAction: "Connect GitHub to fetch live details",
      ghCreatedAt: new Date(),
      ghUpdatedAt: new Date(),
    });
    return id;
  }
  const tok = await getGithubToken(db);
  if (!tok) throw new HttpError(409, "Connect GitHub first");
  const settings = await getSettings(db);
  const client = new GitHubClient({
    token: tok.token,
    minRemaining: settings.sync.minRateRemaining,
    onRate: (r) => recordRate(db, r),
  });
  const nodeId = await resolveNumber(client, parsed.owner, parsed.name, parsed.number);
  if (!nodeId)
    throw new HttpError(404, "GitHub couldn't find that item (or the token can't see it)");
  const res = await runSync(db, "item", {
    trigger: "add-by-url",
    itemIds: [nodeId],
    source: "manual",
    client,
    me: tok.login ?? env.ALLOWED_GITHUB_LOGIN,
  });
  if (res.status === "failed") throw new HttpError(502, res.error ?? "Sync failed");
  return nodeId;
}
