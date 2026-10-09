import { api } from "@/server/api";
import { triggerSync } from "@/server/sync";

export const dynamic = "force-dynamic";

export const POST = api(
  async ({ db, params }) => triggerSync(db, "item", { itemIds: [params.id!] }),
  { mutation: true, rateLimit: 30 },
);
