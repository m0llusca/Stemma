import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionApi: vi.fn(),
  auditLog: vi.fn(),
  transaction: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  credentialFindMany: vi.fn(),
  credentialUpsert: vi.fn()
}));

vi.mock("@/lib/api/session", () => ({
  requireSessionApi: mocks.requireSessionApi
}));

vi.mock("@/lib/audit", () => ({
  auditLog: mocks.auditLog
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: mocks.transaction
  }
}));

function txClient() {
  return {
    integration: {
      findUnique: mocks.findUnique,
      upsert: mocks.upsert,
      update: mocks.update
    },
    integrationCredential: {
      findMany: mocks.credentialFindMany,
      upsert: mocks.credentialUpsert
    }
  };
}

describe("integrations API client status cap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionApi.mockResolvedValue({
      ok: true,
      user: { id: "user-1", workspaceId: "workspace-1" }
    });
    mocks.transaction.mockImplementation(async (callback: (tx: ReturnType<typeof txClient>) => unknown) =>
      callback(txClient())
    );
    mocks.findUnique.mockResolvedValue(null);
    mocks.upsert.mockResolvedValue({
      id: "integration-1",
      source: "custom_api",
      displayName: "Custom",
      type: "custom_api",
      status: "ready",
      authMode: "token"
    });
    mocks.credentialFindMany.mockResolvedValue([]);
    mocks.auditLog.mockResolvedValue({});
  });

  it("rejects client attempts to set status=active on upsert", async () => {
    const { POST } = await import("@/app/api/v1/integrations/route");
    const response = await POST(
      new Request("http://localhost/api/v1/integrations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: "custom_api",
          displayName: "Custom API",
          type: "custom_api",
          status: "active"
        })
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects client attempts to set status=queued on upsert", async () => {
    const { POST } = await import("@/app/api/v1/integrations/route");
    const response = await POST(
      new Request("http://localhost/api/v1/integrations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: "custom_api",
          displayName: "Custom API",
          type: "custom_api",
          status: "queued"
        })
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("allows client-settable statuses draft|ready|disabled", async () => {
    const { POST } = await import("@/app/api/v1/integrations/route");

    for (const status of ["draft", "ready", "disabled"] as const) {
      mocks.upsert.mockResolvedValueOnce({
        id: "integration-1",
        source: "custom_api",
        displayName: "Custom API",
        type: "custom_api",
        status,
        authMode: "token"
      });

      const response = await POST(
        new Request("http://localhost/api/v1/integrations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            source: "custom_api",
            displayName: "Custom API",
            type: "custom_api",
            status
          })
        })
      );

      expect(response.status).toBe(201);
      const upsertArgs = mocks.upsert.mock.calls.at(-1)?.[0];
      expect(upsertArgs.create.status).toBe(status);
      expect(upsertArgs.update.status).toBe(status);
    }
  });
});
