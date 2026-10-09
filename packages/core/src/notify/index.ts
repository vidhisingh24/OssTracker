import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { itemEvents, items, outboundPings, userMeta } from "../db/schema";
import { getSettings, getState, setState } from "../db/settings";
import { getEnv } from "../env";
import { logger } from "../lib/logger";
import { EVENT_META } from "../derive/labels";
import type { EventType, Settings } from "../types";
import { getToday } from "../db/queries/items";

export interface Ping {
  title: string;
  body: string;
  url?: string | null;
}

type Channel = "email" | "telegram" | "ntfy";

export function enabledChannels(settings: Settings): Channel[] {
  const env = getEnv();
  const out: Channel[] = [];
  if (settings.notify.email && env.RESEND_API_KEY && env.NOTIFY_EMAIL_TO && env.NOTIFY_EMAIL_FROM)
    out.push("email");
  if (settings.notify.telegram && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID)
    out.push("telegram");
  if (settings.notify.ntfy && env.NTFY_URL) out.push("ntfy");
  return out;
}

/** HH:MM in the given zone. */
function localMinutes(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

export function inQuietHours(
  now: Date,
  q: { enabled: boolean; start: string; end: string },
  timeZone: string,
): boolean {
  if (!q.enabled) return false;
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const cur = localMinutes(now, timeZone);
  const start = toMin(q.start);
  const end = toMin(q.end);
  return start <= end ? cur >= start && cur < end : cur >= start || cur < end;
}

async function send(channel: Channel, ping: Ping, fetchImpl: typeof fetch = fetch): Promise<void> {
  const env = getEnv();
  const text = `${ping.title}\n${ping.body}${ping.url ? `\n${ping.url}` : ""}`;
  let res: Response;
  if (channel === "email") {
    res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.NOTIFY_EMAIL_FROM,
        to: [env.NOTIFY_EMAIL_TO],
        subject: ping.title,
        text,
      }),
    });
  } else if (channel === "telegram") {
    res = await fetchImpl(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
    });
  } else {
    res = await fetchImpl(env.NTFY_URL!, {
      method: "POST",
      headers: {
        Title: ping.title.replace(/[^\x20-\x7e]/g, ""),
        ...(ping.url ? { Click: ping.url } : {}),
        ...(env.NTFY_TOKEN ? { Authorization: `Bearer ${env.NTFY_TOKEN}` } : {}),
      },
      body: `${ping.body}`,
    });
  }
  if (!res.ok) throw new Error(`${channel} responded ${res.status}`);
}

/** Send pending high-priority events to configured channels (respecting quiet hours). */
export async function dispatchPending(db: Db, now = new Date()): Promise<number> {
  const settings = await getSettings(db);
  const channels = enabledChannels(settings);
  const pending = await db
    .select({
      e: itemEvents,
      title: items.title,
      repo: items.repoFullName,
      number: items.number,
      url: items.url,
    })
    .from(itemEvents)
    .innerJoin(items, eq(items.id, itemEvents.itemId))
    .where(and(isNull(itemEvents.dispatchedAt), eq(itemEvents.priority, "high")))
    .limit(50);
  if (!pending.length) return 0;
  const wanted = pending.filter((p) => settings.notify.events.includes(p.e.type as EventType));
  const ids = pending.map((p) => p.e.id);
  if (!channels.length || !wanted.length) {
    await db.update(itemEvents).set({ dispatchedAt: now }).where(inArray(itemEvents.id, ids));
    return 0;
  }
  if (inQuietHours(now, settings.notify.quietHours, settings.notify.timezone)) return 0; // retried after quiet hours
  let sent = 0;
  for (const p of wanted) {
    const label = EVENT_META[p.e.type as EventType]?.label ?? p.e.type;
    const ping: Ping = {
      title: `${label} · ${p.repo}${p.number ? `#${p.number}` : ""}`,
      body: `${p.title}${p.e.actor ? ` — @${p.e.actor}` : ""}${typeof p.e.payload.excerpt === "string" && p.e.payload.excerpt ? `\n“${p.e.payload.excerpt}”` : ""}`,
      url: typeof p.e.payload.url === "string" ? p.e.payload.url : p.url,
    };
    for (const c of channels) {
      try {
        await send(c, ping);
        await db
          .insert(outboundPings)
          .values({ channel: c, kind: "event", eventIds: [p.e.id], status: "sent" });
        sent++;
      } catch (err) {
        logger.warn({ err, channel: c }, "notification send failed");
        await db.insert(outboundPings).values({
          channel: c,
          kind: "event",
          eventIds: [p.e.id],
          status: "failed",
          error: (err as Error).message,
        });
      }
    }
  }
  await db.update(itemEvents).set({ dispatchedAt: now }).where(inArray(itemEvents.id, ids));
  return sent;
}

/** Daily morning digest of the Needs-you queue. Idempotent per local day. */
export async function sendDigest(db: Db, now = new Date()): Promise<boolean> {
  const settings = await getSettings(db);
  if (!settings.notify.digest.enabled) return false;
  const channels = enabledChannels(settings);
  if (!channels.length) return false;
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: settings.notify.timezone }).format(now);
  const hour = Math.floor(localMinutes(now, settings.notify.timezone) / 60);
  const last = await getState<{ day: string }>(db, "state.digest");
  if (last?.day === day || hour < settings.notify.digest.hour) return false;
  const t = await getToday(db, { now });
  const lines = t.needsYou
    .slice(0, 10)
    .map(
      (r) =>
        `• ${r.repoFullName}#${r.number ?? ""} ${r.title} — ${r.attentionReasons[0]?.label ?? r.nextAction ?? ""}`,
    );
  const ping: Ping = {
    title: `Contrib: ${t.stats.needsYou} need you · ${t.stats.waiting} waiting`,
    body: lines.length ? lines.join("\n") : "Nothing needs you today. Enjoy.",
    url: getEnv().APP_URL,
  };
  for (const c of channels)
    await send(c, ping).catch((err: unknown) =>
      logger.warn({ err, channel: c }, "digest send failed"),
    );
  await setState(db, "state.digest", { day });
  return true;
}

/** Turn due reminders into high-priority events (which then flow through dispatch + inbox). */
export async function fireReminders(db: Db, now = new Date()): Promise<number> {
  const due = await db
    .select({ itemId: userMeta.itemId, remindAt: userMeta.remindAt })
    .from(userMeta)
    .where(
      and(
        lte(userMeta.remindAt, now),
        sql`(${userMeta.remindedAt} is null or ${userMeta.remindedAt} < ${userMeta.remindAt})`,
      ),
    );
  for (const d of due) {
    await db
      .insert(itemEvents)
      .values({
        itemId: d.itemId,
        type: "reminder",
        occurredAt: d.remindAt!,
        priority: "high",
        payload: {},
        dedupeKey: `${d.itemId}:reminder:${d.remindAt!.toISOString()}`,
      })
      .onConflictDoNothing();
    await db.update(userMeta).set({ remindedAt: now }).where(eq(userMeta.itemId, d.itemId));
  }
  return due.length;
}
