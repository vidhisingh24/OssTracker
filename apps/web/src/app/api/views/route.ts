import { createSavedView, deleteSavedView, savedViewSchema } from "@contrib/core/queries";
import { api, badRequest, jsonBody } from "@/server/api";

export const dynamic = "force-dynamic";

export const POST = api(
  async ({ db, req }) => createSavedView(db, await jsonBody(req, savedViewSchema)),
  { mutation: true },
);

export const DELETE = api(
  async ({ db, req }) => {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw badRequest("id required");
    await deleteSavedView(db, id);
    return { ok: true };
  },
  { mutation: true },
);
