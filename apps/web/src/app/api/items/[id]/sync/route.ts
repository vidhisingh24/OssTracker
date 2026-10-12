import { api } from "@/server/api";
import { triggerSync } from "@/server/sync";

export const dynamic = "force-dynamic";
// Inline (serverless) syncs run after the response via `after()` and need the long limit.
export const maxDuration = 300;

export const POST = api(
  async ({ db, params }) => triggerSync(db, "item", { itemIds: [params.id!] }),
  { mutation: true, rateLimit: 30 },
);
