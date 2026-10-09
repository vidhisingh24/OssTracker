import { getState, setState } from "@contrib/core/db";
import { getToday } from "@contrib/core/queries";
import { api } from "@/server/api";

export const dynamic = "force-dynamic";

const VISIT_KEY = "state.lastVisit";
const SESSION_GAP_MS = 30 * 60_000;

export const GET = api(async ({ db }) => {
  const now = new Date();
  const visit = (await getState<{ prev: string | null; current: string }>(db, VISIT_KEY)) ?? {
    prev: null,
    current: now.toISOString(),
  };
  // A new "visit" starts after 30 minutes away; "changed since last visit" compares to the previous one.
  let next = visit;
  if (now.getTime() - Date.parse(visit.current) > SESSION_GAP_MS)
    next = { prev: visit.current, current: now.toISOString() };
  else next = { ...visit, current: now.toISOString() };
  await setState(db, VISIT_KEY, next);
  return getToday(db, { now, lastVisitAt: next.prev ? new Date(next.prev) : null });
});
