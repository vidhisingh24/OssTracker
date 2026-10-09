import { bulkSchema, bulkUpdate } from "@contrib/core/queries";
import { api, jsonBody } from "@/server/api";

export const dynamic = "force-dynamic";

export const POST = api(
  async ({ db, req }) => ({ updated: await bulkUpdate(db, await jsonBody(req, bulkSchema)) }),
  { mutation: true, rateLimit: 30 },
);
