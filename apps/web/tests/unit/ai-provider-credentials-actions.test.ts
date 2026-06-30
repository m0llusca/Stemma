import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertCanPersistSettings: vi.fn(),
  auditLog: vi.fn(),
  requireCurrentUserPermission: vi.fn(),
  revalidatePath: vi.fn(),
  encryptSecret: vi.fn(),
  credentialUpsert: vi.fn(),
  credentialDeleteMany: vi.fn()
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/audit", () => ({ auditLog: mocks.auditLog }));
vi.mock("@/lib/current-user", () => ({
  assertCanPersistSettings: mocks.assertCanPersistSettings,
  requireCurrentUserPermission: mocks.requireCurrentUserPermission
}));
vi.mock("@/lib/secrets", () => ({ encryptSecret: mocks.encryptSecret }));
vi.mock("@/lib/db", () => ({
  prisma: {
    aiProviderCredential: {
      upsert: mocks.credentialUpsert,
      deleteMany: mocks.credentialDeleteMany
    }
  }
}));

function form(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  formData.set("provider", "yandexgpt");
  formData.set("apiKey", "ya-secret-key");
  formData.set("catalogId", "b1gcatalog");
  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }
  return formData;
}

describe("ai provider credential admin action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentUserPermission.mockResolvedValue({ id: "user-1", workspaceId: "ws-1" });
    mocks.encryptSecret.mockImplementation((value: string) => `enc(${value})`);
    mocks.credentialUpsert.mockResolvedValue({ id: "cred-1", provider: "yandexgpt" });
    mocks.credentialDeleteMany.mockResolvedValue({ count: 1 });
    mocks.auditLog.mockResolvedValue({});
  });

  it("upserts an encrypted key plus non-secret extras in configJson", async () => {
    const { saveAiProviderCredential } = await import("@/lib/ai-provider-credentials-actions");

    const state = await saveAiProviderCredential({ status: "idle" }, form());

    expect(mocks.requireCurrentUserPermission).toHaveBeenCalledWith("backend_jobs:manage");
    expect(mocks.assertCanPersistSettings).toHaveBeenCalled();

    const args = mocks.credentialUpsert.mock.calls[0][0];
    expect(args.where).toEqual({ workspaceId_provider: { workspaceId: "ws-1", provider: "yandexgpt" } });
    expect(mocks.encryptSecret).toHaveBeenCalledWith("ya-secret-key");
    expect(args.create.secretRef).toBe("enc(ya-secret-key)");
    expect(args.update.secretRef).toBe("enc(ya-secret-key)");
    expect(JSON.parse(args.create.configJson)).toEqual({ catalogId: "b1gcatalog" });

    expect(state.status).toBe("success");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/ai-scoring");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin");
  });

  it("preserves an existing key when the key field is left blank", async () => {
    const { saveAiProviderCredential } = await import("@/lib/ai-provider-credentials-actions");

    await saveAiProviderCredential({ status: "idle" }, form({ apiKey: "" }));

    const args = mocks.credentialUpsert.mock.calls[0][0];
    expect(mocks.encryptSecret).not.toHaveBeenCalled();
    expect(args.update).not.toHaveProperty("secretRef");
    expect(args.create.secretRef).toBeNull();
  });

  it("clears the credential when the clear flag is set", async () => {
    const { saveAiProviderCredential } = await import("@/lib/ai-provider-credentials-actions");

    const state = await saveAiProviderCredential({ status: "idle" }, form({ clear: "1" }));

    expect(mocks.credentialDeleteMany).toHaveBeenCalledWith({
      where: { workspaceId: "ws-1", provider: "yandexgpt" }
    });
    expect(mocks.credentialUpsert).not.toHaveBeenCalled();
    expect(state.status).toBe("success");
  });

  it("rejects an unknown provider", async () => {
    const { saveAiProviderCredential } = await import("@/lib/ai-provider-credentials-actions");

    const state = await saveAiProviderCredential({ status: "idle" }, form({ provider: "gemini" }));

    expect(state.status).toBe("error");
    expect(mocks.credentialUpsert).not.toHaveBeenCalled();
    expect(mocks.credentialDeleteMany).not.toHaveBeenCalled();
  });

  it("never writes the raw key into audit metadata", async () => {
    const { saveAiProviderCredential } = await import("@/lib/ai-provider-credentials-actions");

    await saveAiProviderCredential({ status: "idle" }, form());

    const serialized = mocks.auditLog.mock.calls.map((call) => JSON.stringify(call[0]));
    for (const entry of serialized) {
      expect(entry).not.toContain("ya-secret-key");
    }
  });

  it("stores an empty config when no optional fields are provided", async () => {
    const { saveAiProviderCredential } = await import("@/lib/ai-provider-credentials-actions");

    const formData = new FormData();
    formData.set("provider", "anthropic");
    formData.set("apiKey", "sk-ant-key");

    await saveAiProviderCredential({ status: "idle" }, formData);

    const args = mocks.credentialUpsert.mock.calls[0][0];
    expect(args.create.configJson).toBe("{}");
    expect(args.update.configJson).toBe("{}");
  });
});
