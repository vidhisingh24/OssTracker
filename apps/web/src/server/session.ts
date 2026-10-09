import "server-only";
import { getEnv } from "@contrib/core/env";

export interface Viewer {
  login: string;
  name: string | null;
  avatarUrl: string | null;
  demo: boolean;
}

/**
 * Current viewer. With OAuth disabled (demo / local), everyone is the configured login.
 * With OAuth enabled, the Auth.js session must belong to the allow-listed login.
 */
export async function getViewer(): Promise<Viewer | null> {
  const env = getEnv();
  if (!env.authEnabled) {
    return {
      login: env.ALLOWED_GITHUB_LOGIN,
      name: env.isDemo ? "Vidhi Singh" : null,
      avatarUrl: null,
      demo: env.isDemo,
    };
  }
  const { auth } = await import("./auth");
  const session = await auth();
  const login = session?.user?.login;
  if (!login || login.toLowerCase() !== env.ALLOWED_GITHUB_LOGIN.toLowerCase()) return null;
  return {
    login,
    name: session.user?.name ?? null,
    avatarUrl: session.user?.image ?? null,
    demo: env.isDemo,
  };
}
