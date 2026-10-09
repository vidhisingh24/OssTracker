import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getEnv } from "@contrib/core/env";
import { getSyncStatus } from "@contrib/core/queries";
import { appDb } from "@/server/db";

export const dynamic = "force-dynamic";

/** Liveness + readiness: database reachable, age of last successful sync, API quota. No auth, no secrets. */
export async function GET() {
  const started = Date.now();
  try {
    const env = getEnv();
    const db = await appDb();
    await db.execute(sql`select 1`);
    const status = await getSyncStatus(db);
    const lastSyncAgeSec = status.lastSuccessAt
      ? Math.round((Date.now() - Date.parse(status.lastSuccessAt)) / 1000)
      : null;
    const gql = status.rate.find((r) => r.resource === "graphql");
    const degraded = !env.isDemo && (lastSyncAgeSec == null || lastSyncAgeSec > 6 * 3600);
    return NextResponse.json(
      {
        status: degraded ? "degraded" : "ok",
        mode: env.isDemo ? "demo" : "live",
        db: { ok: true, driver: env.dbDriver, latencyMs: Date.now() - started },
        sync: {
          lastSuccessAt: status.lastSuccessAt,
          lastSyncAgeSec,
          running: status.running.length,
        },
        quota: gql ? { remaining: gql.remaining, limit: gql.limit, resetAt: gql.resetAt } : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ status: "error", db: { ok: false } }, { status: 503 });
  }
}
