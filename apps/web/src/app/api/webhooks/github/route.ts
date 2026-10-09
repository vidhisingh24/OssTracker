import { NextResponse, type NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { schema } from "@contrib/core/db";
import { getEnv } from "@contrib/core/env";
import { verifyWebhookSignature } from "@contrib/core/crypto";
import { logger } from "@contrib/core/logger";
import { appDb } from "@/server/db";
import { triggerSync } from "@/server/sync";

export const dynamic = "force-dynamic";

/**
 * Optional webhook receiver for repos you own (WEBHOOKS_ENABLED=true). HMAC-verified; it only
 * triggers a targeted refresh of the affected item — polling remains the source of truth.
 */
export async function POST(req: NextRequest) {
  const env = getEnv();
  if (!env.WEBHOOKS_ENABLED || !env.GITHUB_WEBHOOK_SECRET)
    return NextResponse.json({ error: "Webhooks disabled" }, { status: 404 });
  const body = await req.text();
  if (body.length > 5_000_000) return NextResponse.json({ error: "Too large" }, { status: 413 });
  if (
    !verifyWebhookSignature(body, req.headers.get("x-hub-signature-256"), env.GITHUB_WEBHOOK_SECRET)
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  const event = req.headers.get("x-github-event") ?? "unknown";
  if (event === "ping") return NextResponse.json({ ok: true });
  let payload: {
    repository?: { full_name?: string };
    pull_request?: { number?: number };
    issue?: { number?: number };
  };
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  const repo = payload.repository?.full_name;
  const number = payload.pull_request?.number ?? payload.issue?.number;
  if (!repo || !number) return NextResponse.json({ ok: true, ignored: event });
  const db = await appDb();
  const found = await db
    .select({ id: schema.items.id })
    .from(schema.items)
    .where(
      and(
        sql`lower(${schema.items.repoFullName}) = ${repo.toLowerCase()}`,
        eq(schema.items.number, number),
      ),
    )
    .limit(1);
  if (found[0]) await triggerSync(db, "item", { itemIds: [found[0].id] });
  logger.info({ event, repo, number, tracked: !!found[0] }, "webhook received");
  return NextResponse.json({ ok: true });
}
