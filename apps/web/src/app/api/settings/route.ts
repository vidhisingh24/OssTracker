import { z } from "zod";
import { getSettings, updateSettings } from "@contrib/core/db";
import { getEnv } from "@contrib/core/env";
import { getGithubAccount } from "@contrib/core/github";
import { seedDemo, wipeData } from "@contrib/core/demo";
import { api, jsonBody } from "@/server/api";
import { triggerSync } from "@/server/sync";

export const dynamic = "force-dynamic";
// Inline (serverless) syncs run after the response via `after()` and need the long limit.
export const maxDuration = 300;

export const GET = api(async ({ db }) => {
  const env = getEnv();
  const [settings, account] = await Promise.all([getSettings(db), getGithubAccount(db)]);
  return {
    settings,
    connection: {
      mode: env.isDemo ? "demo" : "live",
      authEnabled: env.authEnabled,
      account: account
        ? {
            login: account.login,
            name: account.name,
            avatarUrl: account.avatarUrl,
            scopes: account.scopes,
            tokenUpdatedAt: account.tokenUpdatedAt,
          }
        : null,
      patConfigured: !!env.GITHUB_TOKEN,
      requestedScopes: env.githubScopes,
      dbDriver: env.dbDriver,
      webhooksEnabled: env.WEBHOOKS_ENABLED,
    },
    channels: {
      email: !!(env.RESEND_API_KEY && env.NOTIFY_EMAIL_TO && env.NOTIFY_EMAIL_FROM),
      telegram: !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),
      ntfy: !!env.NTFY_URL,
    },
  };
});

export const PATCH = api(
  async ({ db, req }) => ({
    settings: await updateSettings(db, await jsonBody(req, z.record(z.string(), z.unknown()))),
  }),
  { mutation: true },
);

/** Danger zone: re-sync from scratch (keeps notes/tags/programs). */
export const POST = api(
  async ({ db, req }) => {
    const { action } = await jsonBody(req, z.object({ action: z.enum(["resync", "reset-demo"]) }));
    if (getEnv().isDemo) {
      await seedDemo(db, { force: true });
      return { ok: true };
    }
    if (action === "resync") {
      await wipeData(db, { keepManual: true });
      return triggerSync(db, "cold");
    }
    return { ok: false };
  },
  { mutation: true, rateLimit: 5 },
);
