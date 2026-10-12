import "server-only";
import NextAuth, { type DefaultSession } from "next-auth";
import GitHub from "next-auth/providers/github";
import { getEnv } from "@contrib/core/env";
import { logger } from "@contrib/core/logger";
import { saveGithubAccount } from "@contrib/core/github";
import { isDemoSeeded, wipeData } from "@contrib/core/demo";
import { getDb, setState } from "@contrib/core/db";

declare module "next-auth" {
  interface Session {
    user: { login?: string } & DefaultSession["user"];
  }
}

const env = getEnv();

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt", maxAge: 30 * 24 * 3600 },
  pages: { signIn: "/login", error: "/login" },
  logger: {
    error(error) {
      const cause = (error as Error & { cause?: { err?: unknown } }).cause?.err;
      const detail = cause instanceof Error ? cause.message : error.message;
      logger.error({ err: error, cause }, "auth error");
      // Remember the last failure (message only, no stack/secrets) so the login page can show it.
      void getDb()
        .then((db) =>
          setState(db, "state.lastAuthError", {
            at: new Date().toISOString(),
            type: error.name,
            message: detail.replace(/gh[opusr]_[A-Za-z0-9]+/g, "[token]").slice(0, 300),
          }),
        )
        .catch(() => undefined);
    },
  },
  providers: [
    GitHub({
      clientId: env.AUTH_GITHUB_ID,
      clientSecret: env.AUTH_GITHUB_SECRET,
      // GitHub now returns `iss` on the OAuth callback; it must match exactly.
      issuer: "https://github.com/login/oauth",
      authorization: { params: { scope: env.githubScopes.join(" ") } },
    }),
  ],
  callbacks: {
    signIn({ profile }) {
      const login = typeof profile?.login === "string" ? profile.login : null;
      const ok = !!login && login.toLowerCase() === env.ALLOWED_GITHUB_LOGIN.toLowerCase();
      if (!ok) logger.warn({ login }, "sign-in rejected: not the allow-listed GitHub login");
      return ok;
    },
    async jwt({ token, account, profile }) {
      if (account && profile && typeof profile.login === "string") {
        token.login = profile.login;
        if (account.access_token) {
          const db = await getDb();
          // First real sign-in replaces demo data with the user's own. Never block login on it.
          try {
            if (await isDemoSeeded(db)) await wipeData(db);
          } catch (err) {
            logger.error({ err }, "could not clear demo data");
          }
          await saveGithubAccount(db, {
            login: profile.login,
            name: typeof profile.name === "string" ? profile.name : null,
            avatarUrl: typeof profile.avatar_url === "string" ? profile.avatar_url : null,
            nodeId: typeof profile.node_id === "string" ? profile.node_id : null,
            accessToken: account.access_token,
            scopes: account.scope ?? null,
          });
          logger.info({ login: profile.login, scopes: account.scope }, "GitHub account connected");
          const { triggerSync } = await import("./sync");
          try {
            await triggerSync(db, "cold");
          } catch (err) {
            logger.warn({ err }, "could not start initial sync");
          }
        }
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.login === "string") session.user.login = token.login;
      return session;
    },
  },
});
