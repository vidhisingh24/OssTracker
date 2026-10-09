import PgBoss from "pg-boss";
import { getEnv } from "./env";
import { logger } from "./lib/logger";

export const QUEUES = [
  "sync.hot",
  "sync.warm",
  "sync.cold",
  "sync.notifications",
  "sync.item",
  "notify.dispatch",
  "notify.digest",
  "notify.reminders",
] as const;
export type QueueName = (typeof QUEUES)[number];

const key = Symbol.for("contrib.boss");
type G = typeof globalThis & { [key]?: Promise<PgBoss> };

/** Shared pg-boss instance (Postgres only). Web uses it to enqueue, worker to consume. */
export function getBoss(): Promise<PgBoss> {
  const g = globalThis as G;
  if (!g[key]) {
    const env = getEnv();
    if (!env.DATABASE_URL)
      return Promise.reject(new Error("Queue requires DATABASE_URL (Postgres)"));
    const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: "pgboss" });
    boss.on("error", (err) => logger.error({ err }, "pg-boss error"));
    g[key] = boss.start().then(async () => {
      for (const q of QUEUES) await boss.createQueue(q).catch(() => undefined);
      return boss;
    });
    g[key]!.catch(() => {
      g[key] = undefined;
    });
  }
  return g[key]!;
}

export async function enqueue(
  name: QueueName,
  data: Record<string, unknown> = {},
  opts: PgBoss.SendOptions = {},
): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(name, data, {
    retryLimit: 3,
    retryBackoff: true,
    expireInSeconds: 15 * 60,
    ...opts,
  });
}
