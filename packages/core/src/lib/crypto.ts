import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { decodeKey } from "../env";

const VERSION = "v1";

/** AES-256-GCM. Output: `v1.<iv>.<tag>.<ciphertext>` (base64url parts). */
export function encryptSecret(plaintext: string, keyMaterial: string): string {
  const key = decodeKey(keyMaterial);
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes (base64 or hex)");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ct.toString("base64url"),
  ].join(".");
}

export function decryptSecret(payload: string, keyMaterial: string): string {
  const key = decodeKey(keyMaterial);
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes (base64 or hex)");
  const [version, ivB64, tagB64, ctB64] = payload.split(".");
  if (version !== VERSION || !ivB64 || !tagB64 || !ctB64)
    throw new Error("Unsupported ciphertext format");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** Verify a GitHub webhook `X-Hub-Signature-256` header in constant time. */
export function verifyWebhookSignature(
  body: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature?.startsWith("sha256=")) return false;
  const expected = Buffer.from(
    `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`,
  );
  const got = Buffer.from(signature);
  return expected.length === got.length && timingSafeEqual(expected, got);
}
