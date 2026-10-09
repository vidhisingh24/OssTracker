import "server-only";
import { getEnv } from "@contrib/core/env";
import { getGithubAccount } from "@contrib/core/github";
import type { AppInfo } from "@/components/shell/app-context";
import { appDb } from "./db";
import { getViewer } from "./session";

/** Shell info for the signed-in viewer, or null when a sign-in is required. */
export async function getAppInfo(): Promise<AppInfo | null> {
  const env = getEnv();
  const viewer = await getViewer();
  if (!viewer) return null;
  const db = await appDb();
  const account = env.isDemo ? null : await getGithubAccount(db).catch(() => null);
  return {
    isDemo: env.isDemo,
    authEnabled: env.authEnabled,
    user: {
      login: account?.login ?? viewer.login,
      name: account?.name ?? viewer.name,
      avatarUrl: account?.avatarUrl ?? viewer.avatarUrl,
    },
  };
}
