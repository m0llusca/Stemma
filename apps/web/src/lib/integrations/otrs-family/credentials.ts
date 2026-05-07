import type { IntegrationCredential, Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { decryptSecret, encryptSecret } from "@/lib/secrets";

export type OtrsCredentialKind = "auth_password" | "ca_bundle";

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

export function getIntegrationSecretSlots(client: IntegrationCredentialFindClient, integrationId: string) {
  return client.integrationCredential.findMany({
    where: { integrationId },
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
