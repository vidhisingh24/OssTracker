import { getDb, getSettings } from "@contrib/core/db";
import { getEnv } from "@contrib/core/env";
import { logger } from "@contrib/core/logger";
import { dispatchPending, fireReminders, sendDigest } from "@contrib/core/notify";
import { getBoss, QUEUES, type QueueName } from "@contrib/core/queue";
import { runSync, type SyncKind } from "@contrib/core/sync";
import { isDemoSeeded, seedDemo } from "@contrib/core/demo";

process.env.CONTRIB_PROCESS = "worker";
const env = getEnv();
const log = logger.child({ proc: "worker" });

const db = await getDb();
if (env.isDemo) {
  if (!(await isDemoSeeded(db))) await seedDemo(db);
  log.info("demo mode: worker idle (no GitHub token). Exiting cleanly.");
  // Keep the container alive so compose doesn't restart-loop.
  setInterval(() => undefined, 1 << 30);
} else {
  const boss = await getBoss();
  const settings = await getSettings(db);

  const syncHandler =
    (kind: Exclude<SyncKind, "demo">) =>
    async (jobs: { data: { trigger?: string; itemIds?: string[] } }[]) => {
      for (const job of jobs) {
        const res = await runSync(db, kind, {
          trigger: job.data?.trigger ?? "schedule",
          itemIds: job.data?.itemIds,
        });
        if (kind === "notifications") {
          // Self-schedule the next poll honouring X-Poll-Interval.
          await boss.send(
            "sync.notifications",
            {},
            { startAfter: res.pollInterval ?? 60, singletonKey: "notif-poll" },
          );
          if (res.itemsTouched) await boss.send("notify.dispatch", {});
        } else if (res.eventsCreated) await boss.send("notify.dispatch", {});
      }
    };

  const work = (
    name: QueueName,
    fn: (jobs: { data: { trigger?: string; itemIds?: string[] } }[]) => Promise<void>,
  ) =>
    boss.work(name, { batchSize: 1 }, async (jobs) => {
      try {
        await fn(jobs as { data: { trigger?: string; itemIds?: string[] } }[]);
      } catch (err) {
        log.error({ err, queue: name }, "job failed");
        throw err;
      }
    });

  await work("sync.hot", syncHandler("hot"));
  await work("sync.warm", syncHandler("warm"));
  await work("sync.cold", syncHandler("cold"));
  await work("sync.item", syncHandler("item"));
  await work("sync.notifications", syncHandler("notifications"));
  await work("notify.dispatch", async () => void (await dispatchPending(db)));
  await work("notify.reminders", async () => {
    if (await fireReminders(db)) await dispatchPending(db);
  });
  await work("notify.digest", async () => void (await sendDigest(db)));

  const s = settings.sync;
  await boss.schedule("sync.hot", `*/${Math.min(59, s.hotMinutes)} * * * *`, {
    trigger: "schedule",
  });
  await boss.schedule(
    "sync.warm",
    s.warmMinutes >= 60
      ? `7 */${Math.max(1, Math.round(s.warmMinutes / 60))} * * *`
      : `*/${s.warmMinutes} * * * *`,
    { trigger: "schedule" },
  );
  await boss.schedule("sync.cold", `17 */${s.coldHours} * * *`, { trigger: "schedule" });
  await boss.schedule("notify.reminders", "* * * * *", {});
  await boss.schedule("notify.digest", "*/15 * * * *", {});
  await boss.schedule("notify.dispatch", "*/2 * * * *", {});
  // Kick off: notifications poll loop + initial cold sync.
  await boss.send("sync.notifications", {}, { singletonKey: "notif-poll" });
  await boss.send("sync.cold", { trigger: "startup" }, { singletonKey: "startup-cold" });

  log.info({ queues: QUEUES.length, hot: s.hotMinutes, coldHours: s.coldHours }, "worker ready");
  const stop = async () => {
    log.info("worker shutting down");
    await boss.stop({ graceful: true, timeout: 20_000 });
    process.exit(0);
  };
  process.on("SIGTERM", () => void stop());
  process.on("SIGINT", () => void stop());
}
