import { getEnv } from "@contrib/core/env";

const env = getEnv();
console.log(`contrib worker starting (db=${env.dbDriver}, demo=${env.isDemo})`);
