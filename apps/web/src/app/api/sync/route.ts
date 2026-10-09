import { z } from "zod";
import { getEnv } from "@contrib/core/env";
import { getSyncRun, getSyncStatus, listSyncRuns } from "@contrib/core/queries";
import { api, jsonBody, notFound } from "@/server/api";
import { triggerSync } from "@/server/sync";

export const dynamic = "force-dynamic";

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
    mode: env.isDemo ? "demo" : env.dbDriver === "postgres" ? "worker" : "inline",
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
