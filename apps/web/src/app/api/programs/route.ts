import { z } from "zod";
import {
  createOrg,
  createProgram,
  deleteOrg,
  deleteProgram,
  listPrograms,
  orgInputSchema,
  orgPatchSchema,
  programInputSchema,
  programPatchSchema,
  updateOrg,
  updateProgram,
} from "@contrib/core/queries";
import { api, jsonBody, notFound } from "@/server/api";

export const dynamic = "force-dynamic";

export const GET = api(async ({ db, viewer }) => listPrograms(db, viewer.login));

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("createProgram"), data: programInputSchema }),
  z.object({ action: z.literal("updateProgram"), id: z.uuid(), data: programPatchSchema }),
  z.object({ action: z.literal("deleteProgram"), id: z.uuid() }),
  z.object({ action: z.literal("createOrg"), programId: z.uuid(), data: orgInputSchema }),
  z.object({ action: z.literal("updateOrg"), id: z.uuid(), data: orgPatchSchema }),
  z.object({ action: z.literal("deleteOrg"), id: z.uuid() }),
]);

export const POST = api(
  async ({ db, req }) => {
    const a = await jsonBody(req, actionSchema);
    switch (a.action) {
      case "createProgram":
        return createProgram(db, a.data);
      case "updateProgram": {
        const row = await updateProgram(db, a.id, a.data);
        if (!row) throw notFound();
        return row;
      }
      case "deleteProgram":
        await deleteProgram(db, a.id);
        return { ok: true };
      case "createOrg":
        return createOrg(db, a.programId, a.data);
      case "updateOrg": {
        const row = await updateOrg(db, a.id, a.data);
        if (!row) throw notFound();
        return row;
      }
      case "deleteOrg":
        await deleteOrg(db, a.id);
        return { ok: true };
    }
  },
  { mutation: true },
);
