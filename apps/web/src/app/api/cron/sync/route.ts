import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getSettings, getState } from "@contrib/core/db";
import { getEnv } from "@contrib/core/env";
import { logger } from "@contrib/core/logger";
import { dispatchPending, fireReminders, sendDigest } from "@contrib/core/notify";
import { runSync } from "@contrib/core/sync";
import { appDb } from "@/server/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = getEnv().CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/**
 * Scheduled sync for serverless hosting (called every ~10 min by GitHub Actions or Vercel Cron).
 * Runs: notifications poll → hot sync → cold sync when due → warm hourly → reminders → pings → digest.
 */
async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const env = getEnv();
  if (env.isDemo) return NextResponse.json({ ok: true, skipped: "demo mode" });
  const db = await appDb();
  const settings = await getSettings(db);
  const now = Date.now();
  const ran: Record<string, string> = {};

  const lastCold = (await getState<{ at: string }>(db, "state.lastCold"))?.at;
  const coldDue = !lastCold || now - Date.parse(lastCold) > settings.sync.coldHours * 3_600_000;
  const lastWarm = (await getState<{ at: string }>(db, "state.lastWarmCron"))?.at;
  const warmDue = !lastWarm || now - Date.parse(lastWarm) > settings.sync.warmMinutes * 60_000;

  try {
    ran.notifications = (await runSync(db, "notifications", { trigger: "cron" })).status;
    ran[coldDue ? "cold" : "hot"] = (
      await runSync(db, coldDue ? "cold" : "hot", { trigger: "cron" })
    ).status;
    if (warmDue) {
      ran.warm = (await runSync(db, "warm", { trigger: "cron" })).status;
      const { setState } = await import("@contrib/core/db");
      await setState(db, "state.lastWarmCron", { at: new Date().toISOString() });
    }
    await fireReminders(db);
    ran.pings = String(await dispatchPending(db));
    ran.digest = String(await sendDigest(db));
  } catch (err) {
    logger.error({ err }, "cron sync failed");
    return NextResponse.json({ ok: false, ran, error: (err as Error).message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ran });
}

export { handle as GET, handle as POST };
