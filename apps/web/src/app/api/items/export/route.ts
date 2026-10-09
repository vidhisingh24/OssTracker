import { listItems, parseItemFilter, rowsToCsv } from "@contrib/core/queries";
import { api } from "@/server/api";

export const dynamic = "force-dynamic";

export const GET = api(
  async ({ db, req }) => {
    const sp = new URLSearchParams(req.nextUrl.searchParams);
    const format = sp.get("format") === "json" ? "json" : "csv";
    sp.delete("format");
    sp.set("page", "1");
    sp.set("pageSize", "1000");
    const { rows } = await listItems(db, parseItemFilter(sp));
    const stamp = new Date().toISOString().slice(0, 10);
    const body = format === "json" ? JSON.stringify(rows, null, 2) : rowsToCsv(rows);
    return new Response(body, {
      headers: {
        "Content-Type": format === "json" ? "application/json" : "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="contrib-items-${stamp}.${format}"`,
        "Cache-Control": "no-store",
      },
    });
  },
  { rateLimit: 20 },
);
