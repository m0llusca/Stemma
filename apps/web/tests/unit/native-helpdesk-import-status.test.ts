import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  canManageIntegrations: vi.fn(),
  assertCanPersistSettings: vi.fn(),
  upsertCustomConversation: vi.fn(),
  auditLog: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  transaction: vi.fn(),
  integrationFindFirst: vi.fn(),
  integrationUpdate: vi.fn(),
  integrationCreate: vi.fn()
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
  canManageIntegrations: mocks.canManageIntegrations,
  assertCanPersistSettings: mocks.assertCanPersistSettings
}));

vi.mock("@/lib/conversation-import", () => ({
  upsertCustomConversation: mocks.upsertCustomConversation
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
      findFirst: mocks.integrationFindFirst,
      update: mocks.integrationUpdate,
      create: mocks.integrationCreate
    }
  };
}

const minimalTicketPayload = JSON.stringify({
  tickets: [
    {
      id: "ticket-1",
      subject: "Test ticket",
      created_at: "2026-01-01T00:00:00Z",
      comments: [{ id: "c1", body: "hello", created_at: "2026-01-01T00:00:00Z", public: true }]
    }
  ]
});

describe("native helpdesk import integration status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({
      id: "user-1",
      workspaceId: "workspace-1",
      role: "ADMIN"
    });
    mocks.canManageIntegrations.mockReturnValue(true);
    mocks.assertCanPersistSettings.mockResolvedValue(undefined);
    mocks.upsertCustomConversation.mockResolvedValue({ id: "conv-1", externalId: "ticket-1" });
    mocks.auditLog.mockResolvedValue({});
    mocks.redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
    mocks.transaction.mockImplementation(async (callback: (tx: ReturnType<typeof txClient>) => unknown) =>
      callback(txClient())
    );
  });

  it("records integration sync as ready, not active, when creating", async () => {
    mocks.integrationFindFirst.mockResolvedValue(null);
    mocks.integrationCreate.mockResolvedValue({ id: "integration-1" });

    const { importNativeHelpdeskPayload } = await import("@/lib/native-helpdesk-import-actions");
    const formData = new FormData();
    formData.set("source", "zendesk");
    formData.set("payload", minimalTicketPayload);

    await expect(importNativeHelpdeskPayload(formData)).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.integrationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: "workspace-1",
          source: "zendesk",
          status: "ready"
        })
      })
    );
    expect(mocks.integrationCreate.mock.calls[0][0].data.status).not.toBe("active");
  });

  it("records integration sync as ready, not active, when updating", async () => {
    mocks.integrationFindFirst.mockResolvedValue({ id: "integration-existing" });
    mocks.integrationUpdate.mockResolvedValue({ id: "integration-existing" });

    const { importNativeHelpdeskPayload } = await import("@/lib/native-helpdesk-import-actions");
    const formData = new FormData();
    formData.set("source", "zendesk");
    formData.set("payload", minimalTicketPayload);

    await expect(importNativeHelpdeskPayload(formData)).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.integrationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "integration-existing" },
        data: expect.objectContaining({
          status: "ready"
        })
      })
    );
    expect(mocks.integrationUpdate.mock.calls[0][0].data.status).not.toBe("active");
  });
});
