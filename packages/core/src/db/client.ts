import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "./schema";
import { getEnv } from "../env";
import { logger } from "../lib/logger";

export type Schema = typeof schema;
export type Db = PgDatabase<PgQueryResultHKT, Schema>;
export type Tx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
/** Anything that can run queries: the root db or an open transaction. */
export type Executor = Db | Tx;

interface DbHandle {
  db: Db;
  driver: "postgres" | "pglite";
  close: () => Promise<void>;
  ready: Promise<void>;
}

const MIGRATION_LOCK_ID = 727_274_001;

export function findRepoRoot(start = process.cwd()): string {
  let dir = path.resolve(start);
  for (let i = 0; i < 8; i++) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(start);
}

export function findMigrationsFolder(): string {
  const fromEnv = process.env.MIGRATIONS_DIR;
  const candidates = [
    fromEnv,
    path.join(findRepoRoot(), "packages/core/drizzle"),
    path.join(process.cwd(), "drizzle"),
    path.join(process.cwd(), "packages/core/drizzle"),
  ].filter((p): p is string => Boolean(p));
  const found = candidates.find((p) => existsSync(path.join(p, "meta", "_journal.json")));
  if (!found) throw new Error(`Drizzle migrations not found (looked in: ${candidates.join(", ")})`);
  return found;
}

/** Open a database connection. Does not migrate; call `migrateDb` (or use `getDb`, which does both). */
/**
 * Load PGlite's wasm + fs bundle explicitly. Inside bundlers (Next.js) PGlite's own
 * `new URL(..., import.meta.url)` lookup breaks, so we hand it the bytes.
 */
function pgliteAssets(): { wasmModule?: WebAssembly.Module; fsBundle?: Blob } {
  const candidates = [
    process.env.PGLITE_ASSETS_DIR,
    path.join(findRepoRoot(), "packages/core/node_modules/@electric-sql/pglite/dist"),
    path.join(findRepoRoot(), "node_modules/@electric-sql/pglite/dist"),
    path.join(process.cwd(), "node_modules/@electric-sql/pglite/dist"),
  ].filter((p): p is string => Boolean(p));
  const dir = candidates.find((d) => existsSync(path.join(d, "pglite.wasm")));
  if (!dir) return {};
  return {
    wasmModule: new WebAssembly.Module(readFileSync(path.join(dir, "pglite.wasm"))),
    fsBundle: new Blob([readFileSync(path.join(dir, "pglite.data"))]),
  };
}

export function openDb(opts: { url?: string; pgliteDir?: string } = {}): Omit<DbHandle, "ready"> {
  if (opts.url) {
    const pool = new pg.Pool({ connectionString: opts.url, max: 10, idleTimeoutMillis: 30_000 });
    pool.on("error", (err) => logger.error({ err }, "postgres pool error"));
    const db = drizzlePg(pool, { schema }) as unknown as Db;
    return { db, driver: "postgres", close: () => pool.end() };
  }
  const dir = opts.pgliteDir ?? path.join(findRepoRoot(), ".data", "pglite");
  if (dir !== "memory://") mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir === "memory://" ? undefined : dir, pgliteAssets());
  const db = drizzlePglite(client, { schema }) as unknown as Db;
  return { db, driver: "pglite", close: () => client.close() };
}

export async function migrateDb(handle: Omit<DbHandle, "ready">): Promise<void> {
  const migrationsFolder = findMigrationsFolder();
  if (handle.driver === "pglite") {
    await migratePglite(handle.db as unknown as Parameters<typeof migratePglite>[0], {
      migrationsFolder,
    });
    return;
  }
  // Serialize concurrent migrators (web + worker) with an advisory lock.
  const pgDb = handle.db as unknown as Parameters<typeof migratePg>[0];
  const session = (handle.db as unknown as { $client: pg.Pool }).$client;
  const client = await session.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    await migratePg(pgDb, { migrationsFolder });
  } finally {
    await client.query("select pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]).catch(() => undefined);
    client.release();
  }
}

const globalKey = Symbol.for("contrib.db");
type GlobalWithDb = typeof globalThis & { [globalKey]?: DbHandle };

/** Process-wide database singleton (survives Next.js dev hot reloads). Migrates on first use. */
export function getDbHandle(): DbHandle {
  const g = globalThis as GlobalWithDb;
  if (!g[globalKey]) {
    const env = getEnv();
    const handle = openDb({ url: env.DATABASE_URL, pgliteDir: env.PGLITE_DIR });
    const ready = migrateDb(handle).catch((err: unknown) => {
      logger.error({ err }, "database migration failed");
      g[globalKey] = undefined;
      throw err;
    });
    g[globalKey] = { ...handle, ready };
  }
  return g[globalKey]!;
}

export async function getDb(): Promise<Db> {
  const handle = getDbHandle();
  await handle.ready;
  return handle.db;
}
