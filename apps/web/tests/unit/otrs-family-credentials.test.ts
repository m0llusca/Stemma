import type { IntegrationCredential } from "@prisma/client";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { decryptSecret } from "@/lib/secrets";
import {
  decryptIntegrationSecretSlot,
  fingerprintSecret,
  getIntegrationSecretSlots,
  summarizeIntegrationSecretSlots,
  upsertIntegrationSecretSlot
} from "@/lib/integrations/otrs-family/credentials";

const now = new Date("2026-05-07T10:00:00.000Z");
const caPemWithWindowsLines = "  -----BEGIN CERTIFICATE-----\r\nMIIFakeCertificate==\r\n-----END CERTIFICATE-----  \r\n";
const normalizedCaPem = "-----BEGIN CERTIFICATE-----\nMIIFakeCertificate==\n-----END CERTIFICATE-----";

function credential(overrides: Partial<IntegrationCredential>): IntegrationCredential {
  return {
    id: "credential-auth",
    workspaceId: "workspace-1",
    integrationId: "integration-1",
    kind: "auth_password",
    authMode: "user_password",
    encryptedSecret: "encrypted",
    keyVersion: "v1",
    fingerprint: null,
    lastRotatedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

describe("OTRS-family credential slots", () => {
  it("upserts auth password and CA bundle as independent encrypted rows", async () => {
    const tx = {
      integrationCredential: {
        upsert: vi.fn(async (args) =>
          credential({
            id: args.create.kind === "auth_password" ? "credential-auth" : "credential-ca",
            kind: args.create.kind,
            authMode: args.create.authMode,
            encryptedSecret: args.create.encryptedSecret,
            fingerprint: args.create.fingerprint ?? null
          })
        )
      }
    };

    const authSlot = await upsertIntegrationSecretSlot(tx, {
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      kind: "auth_password",
      authMode: "user_password",
      secret: "support-password"
    });
    const caSlot = await upsertIntegrationSecretSlot(tx, {
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      kind: "ca_bundle",
      authMode: "tls_ca_bundle",
      secret: caPemWithWindowsLines
    });

    expect(tx.integrationCredential.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          integrationId_kind: {
            integrationId: "integration-1",
            kind: "auth_password"
          }
        }
      })
    );
    expect(tx.integrationCredential.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          integrationId_kind: {
            integrationId: "integration-1",
            kind: "ca_bundle"
          }
        }
      })
    );
    expect(authSlot.encryptedSecret).not.toContain("support-password");
    expect(caSlot.encryptedSecret).not.toContain("BEGIN CERTIFICATE");
    expect(decryptSecret(authSlot.encryptedSecret)).toBe("support-password");
    expect(decryptSecret(caSlot.encryptedSecret)).toBe(normalizedCaPem);
    expect(caSlot.fingerprint).toBe(fingerprintSecret(caPemWithWindowsLines));
    expect(authSlot.fingerprint).toBeNull();
  });

  it("fingerprints CA bundles with SHA-256 over normalized PEM text", () => {
    const expected = createHash("sha256").update(normalizedCaPem, "utf8").digest("hex");

    expect(fingerprintSecret(caPemWithWindowsLines)).toBe(expected);
  });

  it("keeps config references to credential row ids and CA fingerprint, never PEM contents", async () => {
    const tx = {
      integrationCredential: {
        upsert: vi.fn(async (args) =>
          credential({
            id: "credential-ca",
            kind: "ca_bundle",
            authMode: args.create.authMode,
            encryptedSecret: args.create.encryptedSecret,
            fingerprint: args.create.fingerprint
          })
        )
      }
    };

    const caSlot = await upsertIntegrationSecretSlot(tx, {
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      kind: "ca_bundle",
      authMode: "tls_ca_bundle",
      secret: caPemWithWindowsLines
    });
    const config = {
      tls: {
        caBundleSecretId: caSlot.id,
        caFingerprint: caSlot.fingerprint
      }
    };
    const serialized = JSON.stringify(config);

    expect(config.tls).toEqual({
      caBundleSecretId: "credential-ca",
      caFingerprint: fingerprintSecret(caPemWithWindowsLines)
    });
    expect(serialized).not.toContain("BEGIN CERTIFICATE");
    expect(serialized).not.toContain("MIIFakeCertificate");
  });

  it("loads and decrypts slots by kind", async () => {
    const client = {
      integrationCredential: {
        findMany: vi.fn().mockResolvedValue([credential({ kind: "auth_password" })])
      }
    };

    await expect(getIntegrationSecretSlots(client, "integration-1")).resolves.toEqual([credential({ kind: "auth_password" })]);
    expect(client.integrationCredential.findMany).toHaveBeenCalledWith({
      where: { integrationId: "integration-1" },
      orderBy: [{ kind: "asc" }]
    });
  });

  it("summarizes API-safe credential metadata without encrypted secrets", () => {
    const slots = [
      credential({
        encryptedSecret: "encrypted-auth",
        lastRotatedAt: null
      }),
      credential({
        id: "credential-ca",
        kind: "ca_bundle",
        authMode: "tls_ca_bundle",
        encryptedSecret: "encrypted-ca",
        fingerprint: "abc123"
      })
    ];

    expect(decryptIntegrationSecretSlot(slots, "missing" as never)).toBeUndefined();
    expect(summarizeIntegrationSecretSlots(slots)).toEqual([
      {
        id: "credential-auth",
        kind: "auth_password",
        authMode: "user_password",
        hasCredential: true,
        fingerprint: null,
        lastRotatedAt: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      },
      {
        id: "credential-ca",
        kind: "ca_bundle",
        authMode: "tls_ca_bundle",
        hasCredential: true,
        fingerprint: "abc123",
        lastRotatedAt: now.toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      }
    ]);
    expect(JSON.stringify(summarizeIntegrationSecretSlots(slots))).not.toContain("encryptedSecret");
    expect(JSON.stringify(summarizeIntegrationSecretSlots(slots))).not.toContain("encrypted-ca");
  });
});
