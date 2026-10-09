import { eq, sql } from "drizzle-orm";
import type { Executor } from "./client";
import { settings } from "./schema";
import { DEFAULT_SETTINGS, settingsSchema, type Settings } from "../types";

const SETTINGS_KEY = "app";

function deepMerge<T>(base: T, patch: unknown): T {
  if (patch == null || typeof patch !== "object" || Array.isArray(patch))
    return (patch ?? base) as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    const cur = out[k];
    out[k] =
      cur &&
      typeof cur === "object" &&
      !Array.isArray(cur) &&
      v &&
      typeof v === "object" &&
      !Array.isArray(v)
        ? deepMerge(cur, v)
        : v;
  }
  return out as T;
}

export async function getSettings(db: Executor): Promise<Settings> {
  const rows = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, SETTINGS_KEY))
    .limit(1);
  const parsed = settingsSchema.safeParse(deepMerge(DEFAULT_SETTINGS, rows[0]?.value ?? {}));
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export async function updateSettings(db: Executor, patch: unknown): Promise<Settings> {
  const current = await getSettings(db);
  const next = settingsSchema.parse(deepMerge(current, patch));
  await setState(db, SETTINGS_KEY, next);
  return next;
}

/** Internal key/value state (cursors, ETags, flags). */
export async function getState<T>(db: Executor, key: string): Promise<T | null> {
  const rows = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);
  return (rows[0]?.value as T | undefined) ?? null;
}

export async function setState(db: Executor, key: string, value: unknown): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: sql`excluded.value`, updatedAt: new Date() },
    });
}

export async function deleteState(db: Executor, key: string): Promise<void> {
  await db.delete(settings).where(eq(settings.key, key));
}
