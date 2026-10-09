import "server-only";
import { getEnv } from "@contrib/core/env";
import type { AppInfo } from "@/components/shell/app-context";

export async function getAppInfo(): Promise<AppInfo> {
  const env = getEnv();
  return {
    isDemo: env.isDemo,
    authEnabled: env.authEnabled,
    user: {
      login: env.ALLOWED_GITHUB_LOGIN,
      name: env.isDemo ? "Vidhi Singh" : null,
      avatarUrl: null,
    },
  };
}
