import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";

/**
 * Soft fallback used only when `QC_SECRET_KEY` is unset in local `development` or `test`.
 * Production boot already fails closed in instrumentation; this module also refuses the
 * fallback for any other NODE_ENV so staging/preview hosts cannot silently encrypt with
 * a public default.
 */
export const LOCAL_DEV_SECRET_FALLBACK = "local-dev-secret-key-change-before-production";

function allowsLocalSecretFallback(nodeEnv: string | undefined) {
  return nodeEnv === undefined || nodeEnv === "development" || nodeEnv === "test";
}

function keyFromEnvironment() {
  const raw = process.env.QC_SECRET_KEY;

  if (raw) {
    return createHash("sha256").update(raw, "utf8").digest();
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("QC_SECRET_KEY must be configured in production.");
  }

  if (!allowsLocalSecretFallback(process.env.NODE_ENV)) {
    throw new Error(
      "QC_SECRET_KEY must be configured outside local development (NODE_ENV=development|test)."
    );
  }

  return createHash("sha256").update(LOCAL_DEV_SECRET_FALLBACK, "utf8").digest();
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, keyFromEnvironment(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptSecret(value: string) {
  const [version, iv, tag, encrypted] = value.split(":");

  if (version !== "v1" || !iv || !tag || !encrypted) {
    throw new Error("Некорректный формат секрета.");
  }

  const decipher = createDecipheriv(algorithm, keyFromEnvironment(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));

  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

export function maskSecret(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value.length <= 8 ? "********" : `${value.slice(0, 4)}...${value.slice(-4)}`;
}
