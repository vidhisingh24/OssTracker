import { eq } from "drizzle-orm";
import type { Executor } from "../db/client";
import { githubAccount } from "../db/schema";
import { getEnv } from "../env";
import { decryptSecret, encryptSecret } from "../lib/crypto";
import { logger } from "../lib/logger";

export interface AccountInput {
  login: string;
  name: string | null;
  avatarUrl: string | null;
  nodeId: string | null;
  accessToken: string;
  scopes: string | null;
}

export async function saveGithubAccount(db: Executor, input: AccountInput): Promise<void> {
  const env = getEnv();
  if (!env.TOKEN_ENCRYPTION_KEY) throw new Error("TOKEN_ENCRYPTION_KEY is not configured");
  const encryptedToken = encryptSecret(input.accessToken, env.TOKEN_ENCRYPTION_KEY);
  const values = {
    id: 1,
    login: input.login,
    name: input.name,
    avatarUrl: input.avatarUrl,
    nodeId: input.nodeId,
    encryptedToken,
    scopes: input.scopes,
    tokenUpdatedAt: new Date(),
  };
  const { id: _id, ...update } = values;
  await db
    .insert(githubAccount)
    .values(values)
    .onConflictDoUpdate({ target: githubAccount.id, set: update });
}

export async function getGithubAccount(db: Executor) {
  const rows = await db
    .select({
      login: githubAccount.login,
      name: githubAccount.name,
      avatarUrl: githubAccount.avatarUrl,
      scopes: githubAccount.scopes,
      tokenUpdatedAt: githubAccount.tokenUpdatedAt,
    })
    .from(githubAccount)
    .where(eq(githubAccount.id, 1))
    .limit(1);
  return rows[0] ?? null;
}

/** OAuth token (decrypted) or the PAT fallback. Never returned to the browser. */
export async function getGithubToken(
  db: Executor,
): Promise<{ token: string; login: string | null; source: "oauth" | "pat" } | null> {
  const env = getEnv();
  const rows = await db.select().from(githubAccount).where(eq(githubAccount.id, 1)).limit(1);
  const row = rows[0];
  if (row && env.TOKEN_ENCRYPTION_KEY) {
    try {
      return {
        token: decryptSecret(row.encryptedToken, env.TOKEN_ENCRYPTION_KEY),
        login: row.login,
        source: "oauth",
      };
    } catch (err) {
      logger.error({ err }, "stored GitHub token could not be decrypted (key rotated?)");
    }
  }
  if (env.GITHUB_TOKEN) return { token: env.GITHUB_TOKEN, login: null, source: "pat" };
  return null;
}

export async function clearGithubAccount(db: Executor): Promise<void> {
  await db.delete(githubAccount).where(eq(githubAccount.id, 1));
}
