import pino from "pino";

const level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info");

/**
 * Structured JSON logger. Secrets are redacted by path so a stray `{ token }` never reaches logs.
 */
export const logger = pino({
  level,
  base: { app: "contrib", proc: process.env.CONTRIB_PROCESS ?? "web" },
  redact: {
    paths: [
      "token",
      "accessToken",
      "access_token",
      "encryptedToken",
      "authorization",
      "headers.authorization",
      "*.token",
      "*.accessToken",
      "*.authorization",
      "req.headers.authorization",
      "req.headers.cookie",
    ],
    censor: "[redacted]",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type Logger = typeof logger;
