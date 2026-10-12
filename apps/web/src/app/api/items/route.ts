import { z } from "zod";
import { createPlanned, listItems, parseItemFilter, plannedSchema } from "@contrib/core/queries";
import { api, jsonBody } from "@/server/api";
import { trackByUrl } from "@/server/sync";

export const dynamic = "force-dynamic";
// Inline (serverless) syncs run after the response via `after()` and need the long limit.
export const maxDuration = 300;

export const GET = api(async ({ db, req }) =>
  listItems(db, parseItemFilter(req.nextUrl.searchParams)),
);

const createSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("url"), url: z.url() }),
  plannedSchema.extend({ type: z.literal("planned") }),
]);

export const POST = api(
  async ({ db, req }) => {
    const body = await jsonBody(req, createSchema);
    if (body.type === "url") return { id: await trackByUrl(db, body.url) };
    const { type: _t, ...planned } = body;
    return { id: await createPlanned(db, planned) };
  },
  { mutation: true, rateLimit: 30 },
);
