import { getEnv } from "../env";
import { migrateDb, openDb } from "../db/client";
import { seedDemo } from "../demo/seed";

const env = getEnv();
const handle = openDb({ url: env.DATABASE_URL, pgliteDir: env.PGLITE_DIR });
await migrateDb(handle);
const res = await seedDemo(handle.db, { force: process.argv.includes("--force") });
console.log(
  res.items ? `seeded ${res.items} demo items (${handle.driver})` : "already seeded (use --force)",
);
await handle.close();
