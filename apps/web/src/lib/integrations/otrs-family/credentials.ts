import type { IntegrationCredential, Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { decryptSecret, encryptSecret } from "@/lib/secrets";

export type OtrsCredentialKind =
  | "auth_password"
  | "ca_bundle"
  | "data_source_credentials"
  | "data_source_token"
  | "oauth_client_credentials";

type IntegrationCredentialUpsertClient = {
  integrationCredential: {
    upsert(args: Prisma.IntegrationCredentialUpsertArgs): Promise<IntegrationCredential>;
  };
};

type IntegrationCredentialFindClient = {
  integrationCredential: {
    findMany(args: Prisma.IntegrationCredentialFindManyArgs): Promise<IntegrationCredential[]>;
  };
};

type SecretSlotSummaryInput = Pick<
  IntegrationCredential,
  "id" | "kind" | "authMode" | "fingerprint" | "lastRotatedAt" | "createdAt" | "updatedAt"
>;

type CaBundleReference = Pick<IntegrationCredential, "id" | "fingerprint">;

export async function upsertIntegrationSecretSlot(
  tx: IntegrationCredentialUpsertClient,
  input: {
    workspaceId: string;
    integrationId: string;
    kind: OtrsCredentialKind;
    authMode: string;
    secret: string;
    keyVersion?: string;
    fingerprint?: string | null;
    rotatedAt?: Date;
  }
) {
  const storedSecret = input.kind === "ca_bundle" ? normalizePemText(input.secret) : input.secret;
  const fingerprint = input.fingerprint ?? (input.kind === "ca_bundle" ? fingerprintSecret(storedSecret) : null);
  const encryptedSecret = encryptSecret(storedSecret);
  const lastRotatedAt = input.rotatedAt ?? new Date();

  return tx.integrationCredential.upsert({
    where: {
      integrationId_kind: {
        integrationId: input.integrationId,
        kind: input.kind
      }
    },
    create: {
      workspaceId: input.workspaceId,
      integrationId: input.integrationId,
      kind: input.kind,
      authMode: input.authMode,
      encryptedSecret,
      keyVersion: input.keyVersion ?? "v1",
      fingerprint,
      lastRotatedAt
    },
    update: {
      authMode: input.authMode,
      encryptedSecret,
      keyVersion: input.keyVersion ?? "v1",
      fingerprint,
      lastRotatedAt
    }
  });
}

export function getIntegrationSecretSlots(
  client: IntegrationCredentialFindClient,
  input: {
    workspaceId: string;
    integrationId: string;
  }
) {
  return client.integrationCredential.findMany({
    where: {
      workspaceId: input.workspaceId,
      integrationId: input.integrationId
    },
    orderBy: [{ kind: "asc" }]
  });
}

export function decryptIntegrationSecretSlot(slots: IntegrationCredential[], kind: OtrsCredentialKind) {
  const slot = slots.find((item) => item.kind === kind);

  return slot ? decryptSecret(slot.encryptedSecret) : undefined;
}

export function fingerprintSecret(value: string) {
  return createHash("sha256").update(normalizePemText(value), "utf8").digest("hex");
}

export function summarizeIntegrationSecretSlots(slots: SecretSlotSummaryInput[]) {
  return slots.map((slot) => ({
    id: slot.id,
    kind: slot.kind as OtrsCredentialKind,
    authMode: slot.authMode,
    hasCredential: true,
    fingerprint: slot.fingerprint,
    lastRotatedAt: slot.lastRotatedAt?.toISOString() ?? null,
    createdAt: slot.createdAt.toISOString(),
    updatedAt: slot.updatedAt.toISOString()
  }));
}

export function sanitizeIntegrationCredentialConfig(value: unknown = {}) {
  return sanitizeConfigObject(objectRecord(value) ?? {});
}

export function applyCaBundleCredentialReference(config: Record<string, unknown>, caBundleSlot: CaBundleReference) {
  const sanitizedConfig = sanitizeIntegrationCredentialConfig(config);
  const sanitizedTls = objectRecord(sanitizedConfig.tls) ?? {};

  return {
    ...sanitizedConfig,
    tls: {
      ...sanitizedTls,
      caBundleSecretId: caBundleSlot.id,
      caFingerprint: caBundleSlot.fingerprint
    }
  };
}

export function preserveCaBundleCredentialReference(
  config: Record<string, unknown>,
  existingConfig: unknown,
  caBundleSlot: CaBundleReference
) {
  const sanitizedConfig = sanitizeIntegrationCredentialConfig(config);
  const sanitizedExistingConfig = sanitizeIntegrationCredentialConfig(existingConfig);
  const sanitizedTls = objectRecord(sanitizedConfig.tls) ?? {};
  const existingTls = objectRecord(sanitizedExistingConfig.tls) ?? {};

  return {
    ...sanitizedConfig,
    tls: {
      ...sanitizedTls,
      caBundleSecretId: safeString(existingTls.caBundleSecretId) ?? caBundleSlot.id,
      caFingerprint: safeString(existingTls.caFingerprint) ?? caBundleSlot.fingerprint
    }
  };
}

function normalizePemText(value: string) {
  const lines = value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim());

  while (lines.length > 0 && lines[0] === "") {
    lines.shift();
  }

  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines.join("\n");
}

function sanitizeConfigObject(value: Record<string, unknown>) {
  const sanitized: Record<string, unknown> = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    if (isUnsafeConfigKey(key)) {
      continue;
    }

    const sanitizedValue = sanitizeConfigValue(nestedValue);

    if (sanitizedValue !== undefined) {
      sanitized[key] = sanitizedValue;
    }
  }

  return sanitized;
}

function sanitizeConfigValue(value: unknown): unknown {
  if (typeof value === "string") {
    return isPemText(value) ? undefined : value;
  }

  if (Array.isArray(value)) {
    if (typeof value[0] === "string" && isUnsafeConfigKey(value[0])) {
      return undefined;
    }

    return value.map(sanitizeConfigValue).filter((item) => item !== undefined);
  }

  const record = objectRecord(value);

  if (record) {
    return sanitizeConfigObject(record);
  }

  return value;
}

function objectRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function isUnsafeConfigKey(key: string) {
  if (/^(caBundle|caBundlePem|caCertificate|caCertificatePem|certificatePem|pem)$/i.test(key)) {
    return true;
  }

  const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase();

  return (
    normalizedKey === "authorization" ||
    normalizedKey === "secret" ||
    normalizedKey.startsWith("authorization") ||
    normalizedKey.endsWith("password") ||
    normalizedKey.endsWith("token") ||
    normalizedKey.endsWith("secret") ||
    normalizedKey.endsWith("secretkey") ||
    normalizedKey.endsWith("apikey") ||
    normalizedKey.endsWith("privatekey") ||
    normalizedKey.endsWith("privatekeypem")
  );
}

function isPemText(value: string) {
  return /-----BEGIN [A-Z0-9 ]+-----/.test(value);
}

function safeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}
