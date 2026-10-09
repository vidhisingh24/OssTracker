import {
  deleteLocalItem,
  getItemDetail,
  markItemSeen,
  metaPatchSchema,
  updateItemMeta,
} from "@contrib/core/queries";
import { api, jsonBody, notFound } from "@/server/api";

export const dynamic = "force-dynamic";

export const GET = api(async ({ db, params, viewer }) => {
  const detail = await getItemDetail(db, params.id!, viewer.login);
  if (!detail) throw notFound("Item not found");
  return detail;
});

export const PATCH = api(
  async ({ db, params, req }) => {
    const patch = await jsonBody(req, metaPatchSchema);
    const meta = await updateItemMeta(db, params.id!, patch);
    if (!meta) throw notFound("Item not found");
    if (patch.lastViewedAt) await markItemSeen(db, params.id!);
    return { meta };
  },
  { mutation: true },
);

export const DELETE = api(
  async ({ db, params }) => {
    if (!(await deleteLocalItem(db, params.id!)))
      throw notFound("Only planned or manually added items can be deleted");
    return { ok: true };
  },
  { mutation: true },
);
