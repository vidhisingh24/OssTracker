import { z } from "zod";
import { getEnv } from "@contrib/core/env";
import { getSettings } from "@contrib/core/db";
import { GitHubClient, getGithubToken } from "@contrib/core/github";
import { listInbox, markAllRead, setInboxRead, unreadCount } from "@contrib/core/queries";
import { logger } from "@contrib/core/logger";
import { api, jsonBody } from "@/server/api";

export const dynamic = "force-dynamic";

export const GET = api(async ({ db, req }) => {
  const sp = req.nextUrl.searchParams;
  if (sp.get("count") === "1") return { unread: await unreadCount(db) };
  const source = sp.get("source");
  return listInbox(db, {
    source: source === "github" || source === "event" ? source : "all",
    unread: sp.get("unread") === "1",
    type: sp.get("type")?.split(",").filter(Boolean),
    before: sp.get("before") ?? undefined,
    limit: 50,
  });
});

const bodySchema = z.union([
  z.object({ keys: z.array(z.string().max(80)).min(1).max(500), read: z.boolean() }),
  z.object({ all: z.literal(true), source: z.enum(["github", "event", "all"]).default("all") }),
]);

export const POST = api(
  async ({ db, req }) => {
    const body = await jsonBody(req, bodySchema);
    const settings = await getSettings(db);
    const syncToGithub = settings.notify.markReadOnGithub && !getEnv().isDemo;
    let threadIds: string[] = [];
    if ("all" in body) await markAllRead(db, body.source);
    else threadIds = await setInboxRead(db, body.keys, body.read);
    if (syncToGithub && ("all" in body ? body.source !== "event" : body.read && threadIds.length)) {
      const tok = await getGithubToken(db);
      if (tok) {
        const client = new GitHubClient({ token: tok.token });
        try {
          if ("all" in body)
            await client.rest("/notifications", {
              method: "PUT",
              body: { last_read_at: new Date().toISOString(), read: true },
            });
          else
            for (const id of threadIds)
              await client.rest(`/notifications/threads/${encodeURIComponent(id)}`, {
                method: "PATCH",
              });
        } catch (err) {
          logger.warn({ err }, "could not mark notifications read on GitHub");
        }
      }
    }
    return { ok: true, unread: await unreadCount(db) };
  },
  { mutation: true },
);
