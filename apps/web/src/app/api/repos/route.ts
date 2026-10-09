import { z } from "zod";
import { listRepos, repoMetaPatchSchema, updateRepoMeta } from "@contrib/core/queries";
import { api, jsonBody } from "@/server/api";

export const dynamic = "force-dynamic";

export const GET = api(async ({ db, viewer }) => listRepos(db, viewer.login));

export const PATCH = api(
  async ({ db, req }) => {
    const { fullName, patch } = await jsonBody(
      req,
      z.object({ fullName: z.string().regex(/^[\w.-]+\/[\w.-]+$/), patch: repoMetaPatchSchema }),
    );
    return updateRepoMeta(db, fullName, patch);
  },
  { mutation: true },
);
