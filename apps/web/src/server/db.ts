import "server-only";
import { getDb, type Db } from "@contrib/core/db";
import { getEnv } from "@contrib/core/env";
import { isDemoSeeded, seedDemo } from "@contrib/core/demo";
import { logger } from "@contrib/core/logger";

const key = Symbol.for("contrib.appdb");
type G = typeof globalThis & { [key]?: Promise<Db> };

/** Migrated database; in demo mode also seeded with fake data on first use. */
export function appDb(): Promise<Db> {
  const g = globalThis as G;
  if (!g[key]) {
    g[key] = (async () => {
      const db = await getDb();
      const env = getEnv();
      if (env.isDemo && !(await isDemoSeeded(db))) {
        const res = await seedDemo(db);
        logger.info({ items: res.items }, "demo data seeded");
      }
      return db;
    })().catch((err: unknown) => {
      g[key] = undefined;
      throw err;
    });
  }
  return g[key]!;
}
