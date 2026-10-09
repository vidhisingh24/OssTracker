import { getEnv } from "../env";
import { migrateDb, openDb } from "../db/client";

const env = getEnv();
const handle = openDb({ url: env.DATABASE_URL, pgliteDir: env.PGLITE_DIR });
await migrateDb(handle);
console.log(`migrations applied (${handle.driver})`);
await handle.close();
