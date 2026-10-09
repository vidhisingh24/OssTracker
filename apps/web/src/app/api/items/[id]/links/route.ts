import { z } from "zod";
import { addManualLink, removeManualLink } from "@contrib/core/queries";
import { api, badRequest, jsonBody, notFound } from "@/server/api";

export const dynamic = "force-dynamic";

export const POST = api(
  async ({ db, params, req }) => {
    const { target } = await jsonBody(req, z.object({ target: z.string().trim().min(1).max(500) }));
    const res = await addManualLink(db, params.id!, target);
    if (!res.ok) throw badRequest(res.error);
    return { ok: true };
  },
  { mutation: true },
);

export const DELETE = api(
  async ({ db, req }) => {
    const linkId = req.nextUrl.searchParams.get("linkId");
    if (!linkId) throw badRequest("linkId required");
    if (!(await removeManualLink(db, linkId))) throw notFound("Only manual links can be removed");
    return { ok: true };
  },
  { mutation: true },
);
