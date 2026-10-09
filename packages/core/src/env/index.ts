import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined));

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),

    /** Postgres connection string. When absent, an embedded PGlite database is used (demo / local only). */
    DATABASE_URL: optionalString,
    PGLITE_DIR: optionalString,

    APP_URL: z.url().default("http://localhost:3000"),
    AUTH_SECRET: optionalString,
    AUTH_GITHUB_ID: optionalString,
    AUTH_GITHUB_SECRET: optionalString,
    ALLOWED_GITHUB_LOGIN: z.string().min(1).default("vidhisingh24"),
    /** 32-byte key, base64 or hex encoded. Used for AES-256-GCM encryption of the OAuth token. */
    TOKEN_ENCRYPTION_KEY: optionalString,
    /** Request the `repo` scope so private repositories are tracked too. */
    GITHUB_PRIVATE_REPOS: bool,
    /** Personal access token fallback (worker / headless). OAuth token takes precedence. */
    GITHUB_TOKEN: optionalString,

    DEMO_MODE: bool,

    WEBHOOKS_ENABLED: bool,
    GITHUB_WEBHOOK_SECRET: optionalString,

    RESEND_API_KEY: optionalString,
    NOTIFY_EMAIL_TO: optionalString,
    NOTIFY_EMAIL_FROM: optionalString,
    TELEGRAM_BOT_TOKEN: optionalString,
    TELEGRAM_CHAT_ID: optionalString,
    NTFY_URL: optionalString,
    NTFY_TOKEN: optionalString,
  })
  .superRefine((env, ctx) => {
    if (env.AUTH_GITHUB_ID && !env.AUTH_GITHUB_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_GITHUB_SECRET"],
        message: "required when AUTH_GITHUB_ID is set",
      });
    }
    if (env.AUTH_GITHUB_ID && !env.TOKEN_ENCRYPTION_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["TOKEN_ENCRYPTION_KEY"],
        message: "required when GitHub OAuth is configured",
      });
    }
    if (env.AUTH_GITHUB_ID && !env.AUTH_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_SECRET"],
        message: "required when GitHub OAuth is configured",
      });
    }
    if (env.TOKEN_ENCRYPTION_KEY && decodeKey(env.TOKEN_ENCRYPTION_KEY) === null) {
      ctx.addIssue({
        code: "custom",
        path: ["TOKEN_ENCRYPTION_KEY"],
        message: "must be 32 bytes, base64 or hex encoded",
      });
    }
    if (env.WEBHOOKS_ENABLED && !env.GITHUB_WEBHOOK_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["GITHUB_WEBHOOK_SECRET"],
        message: "required when WEBHOOKS_ENABLED=true",
      });
    }
    if (env.NODE_ENV === "production" && !env.AUTH_GITHUB_ID && !env.DEMO_MODE) {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_GITHUB_ID"],
        message: "production requires GitHub OAuth (or DEMO_MODE=true for a read-only showcase)",
      });
    }
  });

export type RawEnv = z.infer<typeof envSchema>;

export interface Env extends RawEnv {
  /** No real GitHub credentials: UI runs on seeded fake data and auth is bypassed. */
  isDemo: boolean;
  /** GitHub OAuth is configured; every request must carry an allow-listed session. */
  authEnabled: boolean;
  /** Which database driver backs this process. */
  dbDriver: "postgres" | "pglite";
  githubScopes: string[];
}

export function decodeKey(value: string): Buffer | null {
  const hex = /^[0-9a-fA-F]{64}$/.test(value) ? Buffer.from(value, "hex") : null;
  if (hex) return hex;
  try {
    const b = Buffer.from(value, "base64");
    return b.length === 32 ? b : null;
  } catch {
    return null;
  }
}

let cached: Env | null = null;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`,
    );
    throw new Error(`Invalid environment configuration:\n${lines.join("\n")}`);
  }
  const raw = result.data;
  const authEnabled = Boolean(raw.AUTH_GITHUB_ID);
  const isDemo = raw.DEMO_MODE || (!authEnabled && !raw.GITHUB_TOKEN);
  return {
    ...raw,
    isDemo,
    authEnabled,
    dbDriver: raw.DATABASE_URL ? "postgres" : "pglite",
    githubScopes: ["read:user", "notifications", raw.GITHUB_PRIVATE_REPOS ? "repo" : "public_repo"],
  };
}

/** Typed, validated environment. Throws with a readable list of problems on first access. */
export function getEnv(): Env {
  if (!cached) cached = parseEnv(process.env);
  return cached;
}

export function resetEnvCache(): void {
  cached = null;
}
