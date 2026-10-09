import { facetValues, listSavedViews, searchItems } from "@contrib/core/queries";
import { api } from "@/server/api";

export const dynamic = "force-dynamic";

/** Facets for filter pickers, saved views, and palette search (?q=). */
export const GET = api(async ({ db, req }) => {
  const q = req.nextUrl.searchParams.get("q");
  if (q != null) return { results: q.trim() ? await searchItems(db, q.trim()) : [] };
  const [facets, views] = await Promise.all([facetValues(db), listSavedViews(db)]);
  return { facets, views };
});
