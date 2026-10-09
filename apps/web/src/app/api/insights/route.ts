import { getSettings } from "@contrib/core/db";
import { getInsights } from "@contrib/core/queries";
import { api } from "@/server/api";

export const dynamic = "force-dynamic";

export const GET = api(async ({ db, viewer }) => {
  const settings = await getSettings(db);
  return getInsights(db, viewer.login, { timeZone: settings.notify.timezone });
});
