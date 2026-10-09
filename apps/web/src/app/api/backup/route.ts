import { exportBackup, importBackup } from "@contrib/core/queries";
import { api, badRequest } from "@/server/api";

export const dynamic = "force-dynamic";

export const GET = api(
  async ({ db }) =>
    new Response(JSON.stringify(await exportBackup(db), null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="contrib-backup-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    }),
  { rateLimit: 10 },
);

export const POST = api(
  async ({ db, req }) => {
    const text = await req.text();
    if (text.length > 20_000_000) throw badRequest("Backup too large");
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw badRequest("Not a valid JSON backup");
    }
    return importBackup(db, raw);
  },
  { mutation: true, rateLimit: 5 },
);
