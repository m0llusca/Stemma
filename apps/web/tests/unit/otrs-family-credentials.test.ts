import type { IntegrationCredential } from "@prisma/client";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { decryptSecret } from "@/lib/secrets";
import {
  applyCaBundleCredentialReference,
  decryptIntegrationSecretSlot,
  fingerprintSecret,
  getIntegrationSecretSlots,
  sanitizeIntegrationCredentialConfig,
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

    await expect(getIntegrationSecretSlots(client, { workspaceId: "workspace-1", integrationId: "integration-1" })).resolves.toEqual([
      credential({ kind: "auth_password" })
    ]);
    expect(client.integrationCredential.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace-1",
        integrationId: "integration-1"
      },
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

  it("sanitizes API config so CA bundle PEM is never serialized", () => {
    const rawConfig = {
      sourceLabel: "Support",
      caBundle: caPemWithWindowsLines,
      tls: {
        mode: "custom_ca",
        verifyPeer: true,
        caBundle: caPemWithWindowsLines,
        caBundlePem: caPemWithWindowsLines,
        caCertificate: caPemWithWindowsLines,
        notes: "safe"
      },
      nested: {
        certificatePem: caPemWithWindowsLines,
        safeUrl: "https://support.example.com",
        array: [caPemWithWindowsLines, "safe"]
      }
    };

    const sanitized = sanitizeIntegrationCredentialConfig(rawConfig);
    const stored = applyCaBundleCredentialReference(sanitized, {
      id: "credential-ca",
      fingerprint: "fingerprint-123"
    });
    const serialized = JSON.stringify(stored);

    expect(stored).toEqual({
      sourceLabel: "Support",
      tls: {
        mode: "custom_ca",
        verifyPeer: true,
        notes: "safe",
        caBundleSecretId: "credential-ca",
        caFingerprint: "fingerprint-123"
      },
      nested: {
        safeUrl: "https://support.example.com",
        array: ["safe"]
      }
    });
    expect(serialized).not.toContain("BEGIN CERTIFICATE");
    expect(serialized).not.toContain("MIIFakeCertificate");
    expect(serialized).not.toContain("caBundlePem");
    expect(serialized).not.toContain("caCertificate");
    expect(serialized).not.toContain("certificatePem");
  });

  it("removes nested secret-looking config keys before API serialization or storage", () => {
    const rawConfig = {
      sourceLabel: "Support",
      password: "root-password",
      token: "root-token",
      apiToken: "api-token",
      secretKey: "root-secret-key",
      secret_key: "root-secret-key-snake",
      auth: {
        username: "qa-api",
        clientSecret: "client-secret",
        bearerToken: "bearer-token",
        authorization: "Bearer root-token",
        authorizationHeader: "Bearer header-token",
        privateKeyPem: "raw-private-key-material"
      },
      nested: {
        safeUrl: "https://support.example.com",
        array: [
          {
            label: "visible",
            password: "nested-password"
          },
          {
            headers: {
              Authorization: "Bearer nested-token",
              accept: "application/json"
            }
          },
          ["Authorization", "Bearer tuple-token"],
          ["x-api-key", "tuple-api-key"],
          ["accept", "application/json"],
          "safe-value"
        ]
      }
    };

    const sanitized = sanitizeIntegrationCredentialConfig(rawConfig);
    const serialized = JSON.stringify(sanitized);

    expect(sanitized).toEqual({
      sourceLabel: "Support",
      auth: {
        username: "qa-api"
      },
      nested: {
        safeUrl: "https://support.example.com",
        array: [
          {
            label: "visible"
          },
          {
            headers: {
              accept: "application/json"
            }
          },
          ["accept", "application/json"],
          "safe-value"
        ]
      }
    });
    expect(serialized).not.toContain("root-password");
    expect(serialized).not.toContain("root-token");
    expect(serialized).not.toContain("api-token");
    expect(serialized).not.toContain("root-secret-key");
    expect(serialized).not.toContain("root-secret-key-snake");
    expect(serialized).not.toContain("client-secret");
    expect(serialized).not.toContain("bearer-token");
    expect(serialized).not.toContain("header-token");
    expect(serialized).not.toContain("raw-private-key-material");
    expect(serialized).not.toContain("nested-password");
    expect(serialized).not.toContain("nested-token");
    expect(serialized).not.toContain("tuple-token");
    expect(serialized).not.toContain("tuple-api-key");
  });

  it("redacts legacy PEM-bearing configJson from the integrations API response", async () => {
    const prisma = {
      integration: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "integration-1",
            source: "otrs",
            displayName: "OTRS",
            type: "otrs_family",
            status: "ready",
            baseUrl: "https://support.example.com",
            authMode: "token",
            importLimit: 100,
            batchSize: 25,
            dateRangeDays: 30,
            schedule: null,
            syncCursor: null,
            lastSyncedAt: null,
            lastImportAt: null,
            lastError: null,
            configJson: JSON.stringify({
              tls: {
                mode: "custom_ca",
                caBundle: caPemWithWindowsLines,
                caFingerprint: "fingerprint-123"
              },
              caBundle: caPemWithWindowsLines,
              auth: {
                secretKey: "legacy-secret-key",
                authorizationHeader: "Bearer legacy-token"
              }
            }),
            credentials: [],
            runs: []
          }
        ])
      }
    };

    vi.resetModules();
    vi.doMock("@/lib/db", () => ({ prisma }));
    vi.doMock("@/lib/api/session", () => ({
      requireSessionApi: vi.fn().mockResolvedValue({
        ok: true,
        user: {
          id: "user-1",
          workspaceId: "workspace-1",
          role: "ADMIN"
        }
      })
    }));
    vi.doMock("@/lib/current-user", () => ({
      requireCurrentUserPermission: vi.fn(() => {
        throw new Error("legacy auth wrapper used");
      })
    }));

    try {
      const { GET } = await import("@/app/api/v1/integrations/route");
      const response = await GET(
        new Request("http://localhost/api/v1/integrations", {
          headers: { "x-request-id": "req-integrations-1" }
        })
      );
      const body = await response.json();
      const serialized = JSON.stringify(body);
      const configSerialized = JSON.stringify(body.integrations[0].config);

      expect(prisma.integration.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: "workspace-1" },
          include: expect.objectContaining({
            credentials: expect.objectContaining({
              where: { workspaceId: "workspace-1" }
            }),
            runs: expect.objectContaining({
              where: { workspaceId: "workspace-1" }
            })
          })
        })
      );
      expect(body.integrations[0].config).toEqual({
        tls: {
          mode: "custom_ca",
          caFingerprint: "fingerprint-123"
        },
        auth: {}
      });
      expect(serialized).not.toContain("BEGIN CERTIFICATE");
      expect(serialized).not.toContain("MIIFakeCertificate");
      expect(serialized).not.toContain("legacy-secret-key");
      expect(serialized).not.toContain("legacy-token");
      expect(configSerialized).not.toContain("caBundle");
    } finally {
      vi.doUnmock("@/lib/db");
      vi.doUnmock("@/lib/api/session");
      vi.doUnmock("@/lib/current-user");
      vi.resetModules();
    }
  });

  it("preserves existing CA bundle references on API metadata updates without a new CA bundle", async () => {
    const caSlot = credential({
      id: "credential-ca",
      kind: "ca_bundle",
      authMode: "tls_ca_bundle",
      fingerprint: "slot-fingerprint"
    });
    const tx = {
      integration: {
        findUnique: vi.fn().mockResolvedValue({
          configJson: JSON.stringify({
            tls: {
              caBundleSecretId: "credential-ca",
              caFingerprint: "existing-fingerprint"
            }
          }),
          credentials: [
            {
              id: caSlot.id,
              kind: caSlot.kind,
              fingerprint: caSlot.fingerprint
            }
          ]
        }),
        upsert: vi.fn().mockResolvedValue({
          id: "integration-1",
          source: "otrs",
          displayName: "OTRS",
          status: "ready",
          authMode: "token"
        })
      },
      integrationCredential: {
        findMany: vi.fn().mockResolvedValue([caSlot])
      }
    };
    const prisma = {
      $transaction: vi.fn(async (callback) => callback(tx))
    };
    const auditLog = vi.fn();

    vi.resetModules();
    vi.doMock("@/lib/db", () => ({ prisma }));
    vi.doMock("@/lib/audit", () => ({ auditLog }));
    vi.doMock("@/lib/api/session", () => ({
      requireSessionApi: vi.fn().mockResolvedValue({
        ok: true,
        user: {
          id: "user-1",
          workspaceId: "workspace-1"
        }
      })
    }));

    try {
      const { POST } = await import("@/app/api/v1/integrations/route");
      const response = await POST(
        new Request("http://localhost/api/v1/integrations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            source: "otrs",
            displayName: "OTRS",
            type: "otrs_family",
            config: {
              sourceLabel: "Updated OTRS",
              tls: {
                mode: "custom_ca",
                caBundle: caPemWithWindowsLines
              },
              auth: {
                password: "inline-password",
                secretKey: "inline-secret-key",
                authorizationHeader: "Bearer inline-token"
              }
            }
          })
        })
      );
      const body = await response.json();
      const upsertArgs = tx.integration.upsert.mock.calls[0][0];
      const storedUpdateConfig = JSON.parse(upsertArgs.update.configJson);
      const storedCreateConfig = JSON.parse(upsertArgs.create.configJson);
      const serialized = JSON.stringify(storedUpdateConfig);

      expect(storedUpdateConfig).toEqual({
        sourceLabel: "Updated OTRS",
        tls: {
          mode: "custom_ca",
          caBundleSecretId: "credential-ca",
          caFingerprint: "existing-fingerprint"
        },
        auth: {}
      });
      expect(storedCreateConfig).toEqual(storedUpdateConfig);
      expect(serialized).not.toContain("BEGIN CERTIFICATE");
      expect(serialized).not.toContain("MIIFakeCertificate");
      expect(serialized).not.toContain("inline-password");
      expect(serialized).not.toContain("inline-secret-key");
      expect(serialized).not.toContain("inline-token");
      expect(body.integration).toMatchObject({
        id: "integration-1",
        hasCaBundle: true
      });
    } finally {
      vi.doUnmock("@/lib/db");
      vi.doUnmock("@/lib/audit");
      vi.doUnmock("@/lib/api/session");
      vi.resetModules();
    }
  });

  it("rejects REST integration upserts for enterprise and mismatched Phase B sources before secret writes", async () => {
    const tx = {
      integration: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn()
      },
      integrationCredential: {
        upsert: vi.fn(),
        findMany: vi.fn()
      }
    };
    const prisma = {
      $transaction: vi.fn(async (callback) => callback(tx))
    };
    const auditLog = vi.fn();

    vi.resetModules();
    vi.doMock("@/lib/db", () => ({ prisma }));
    vi.doMock("@/lib/audit", () => ({ auditLog }));
    vi.doMock("@/lib/api/session", () => ({
      requireSessionApi: vi.fn().mockResolvedValue({
        ok: true,
        user: {
          id: "user-1",
          workspaceId: "workspace-1"
        }
      })
    }));

    try {
      const { POST } = await import("@/app/api/v1/integrations/route");
      const enterpriseResponse = await POST(
        new Request("http://localhost/api/v1/integrations", {
          method: "POST",
          headers: { "content-type": "application/json", "x-request-id": "request-enterprise" },
          body: JSON.stringify({
            source: "salesforce",
            displayName: "Salesforce",
            type: "enterprise",
            baseUrl: "https://example.my.salesforce.com",
            credentialSecret: "must-not-store"
          })
        })
      );
      const mismatchResponse = await POST(
        new Request("http://localhost/api/v1/integrations", {
          method: "POST",
          headers: { "content-type": "application/json", "x-request-id": "request-mismatch" },
          body: JSON.stringify({
            source: "salesforce",
            displayName: "Salesforce",
            type: "native_helpdesk",
            baseUrl: "https://example.my.salesforce.com",
            credentialSecret: "must-not-store"
          })
        })
      );
      const nativeMismatchResponse = await POST(
        new Request("http://localhost/api/v1/integrations", {
          method: "POST",
          headers: { "content-type": "application/json", "x-request-id": "request-native-mismatch" },
          body: JSON.stringify({
            source: "zendesk",
            displayName: "Zendesk",
            type: "custom_api",
            baseUrl: "https://support.example.com",
            credentialSecret: "must-not-store"
          })
        })
      );
      const enterpriseBody = await enterpriseResponse.json();
      const mismatchBody = await mismatchResponse.json();
      const nativeMismatchBody = await nativeMismatchResponse.json();

      expect(enterpriseResponse.status).toBe(409);
      expect(enterpriseResponse.headers.get("x-request-id")).toBe("request-enterprise");
      expect(enterpriseBody.error).toMatchObject({
        code: "conflict",
        message: "Корпоративные источники требуют защищенной настройки OAuth-доступов."
      });
      expect(mismatchResponse.status).toBe(409);
      expect(mismatchResponse.headers.get("x-request-id")).toBe("request-mismatch");
      expect(mismatchBody.error).toMatchObject({
        code: "conflict",
        message: "Корпоративные источники требуют защищенной настройки OAuth-доступов."
      });
      expect(nativeMismatchResponse.status).toBe(409);
      expect(nativeMismatchResponse.headers.get("x-request-id")).toBe("request-native-mismatch");
      expect(nativeMismatchBody.error).toMatchObject({
        code: "conflict",
        message: "Тип источника не соответствует контракту Phase B."
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.integration.upsert).not.toHaveBeenCalled();
      expect(tx.integrationCredential.upsert).not.toHaveBeenCalled();
      expect(auditLog).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock("@/lib/db");
      vi.doUnmock("@/lib/audit");
      vi.doUnmock("@/lib/api/session");
      vi.resetModules();
    }
  });

  it("does not include failed upstream response bodies in runner errors", async () => {
    const leakedBody =
      "GET /otrs/nph-genericinterface.pl/Webservice/GenericTicketConnectorREST?UserLogin=qa_api&Password=super-secret";
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(leakedBody, { status: 502, statusText: "Bad Gateway" })));
    const now = new Date("2026-05-07T10:00:00.000Z");
    const client = {
      integration: {
        findFirst: vi.fn().mockResolvedValue({
          id: "integration-1",
          workspaceId: "workspace-1",
          source: "custom",
          displayName: "Custom API",
          type: "custom_api",
          status: "ready",
          baseUrl: "https://support.example.com",
          configJson: "{}",
          authMode: "token",
          importLimit: 100,
          batchSize: 25,
          dateRangeDays: 30,
          schedule: null,
          syncCursor: null,
          lastSyncedAt: null,
          lastDryRunAt: null,
          lastImportAt: null,
          lastError: null,
          createdAt: now,
          updatedAt: now,
          credentials: []
        })
      }
    };

    vi.stubGlobal("fetch", fetchMock);

    try {
      const { runIntegrationConnector } = await import("@/lib/integrations/runner");

      await expect(
        runIntegrationConnector({
          workspaceId: "workspace-1",
          integrationId: "integration-1",
          dryRun: true,
          client: client as never
        })
      ).rejects.toThrow("Источник вернул HTTP 502: Bad Gateway");

      await expect(
        runIntegrationConnector({
          workspaceId: "workspace-1",
          integrationId: "integration-1",
          dryRun: true,
          client: client as never
        })
      ).rejects.not.toThrow(/Password|super-secret|UserLogin|GenericTicketConnectorREST/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
