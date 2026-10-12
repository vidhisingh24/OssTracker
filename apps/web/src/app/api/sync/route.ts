import { z } from "zod";
import { getEnv } from "@contrib/core/env";
import { getSyncRun, getSyncStatus, listSyncRuns } from "@contrib/core/queries";
import { api, jsonBody, notFound } from "@/server/api";
import { triggerSync } from "@/server/sync";

export const dynamic = "force-dynamic";
// Inline (serverless) syncs run after the response via `after()` and need the long limit.
export const maxDuration = 300;

export const GET = api(async ({ db, req }) => {
  const sp = req.nextUrl.searchParams;
  const id = sp.get("id");
  if (id) {
    const run = await getSyncRun(db, id);
    if (!run) throw notFound("Run not found");
    return run;
  }
  const [status, runs] = await Promise.all([
    getSyncStatus(db),
    sp.get("runs") === "1"
      ? listSyncRuns(db, { limit: 100, kind: sp.get("kind") ?? undefined })
      : Promise.resolve([]),
  ]);
  const env = getEnv();
  return {
    ...status,
    runs,
    mode: env.isDemo ? "demo" : env.syncMode,
  };
});

export const POST = api(
  async ({ db, req }) => {
    const { kind } = await jsonBody(
      req,
      z.object({ kind: z.enum(["hot", "warm", "cold", "notifications"]).default("cold") }),
    );
    return triggerSync(db, kind);
  },
  { mutation: true, rateLimit: 10 },
);
