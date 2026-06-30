import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUserPermission: vi.fn(),
  assertCanPersistSettings: vi.fn(),
  workspaceUpdate: vi.fn(),
  auditLog: vi.fn(),
  revalidatePath: vi.fn()
}));

vi.mock("@/lib/current-user", () => ({
  requireCurrentUserPermission: mocks.requireCurrentUserPermission,
  assertCanPersistSettings: mocks.assertCanPersistSettings,
  isDemoAuthEnabled: () => false
}));

vi.mock("@/lib/db", () => ({
  prisma: { workspace: { update: mocks.workspaceUpdate } }
}));

vi.mock("@/lib/audit", () => ({
  auditLog: mocks.auditLog
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath
}));

import { saveAiScoringProvider } from "@/lib/ai-scoring-settings-actions";

function form(provider: unknown) {
  const data = new FormData();
  if (typeof provider === "string") {
    data.set("provider", provider);
  }
  return data;
}

describe("saveAiScoringProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentUserPermission.mockResolvedValue({ id: "u1", workspaceId: "ws1" });
    mocks.assertCanPersistSettings.mockResolvedValue(undefined);
    mocks.workspaceUpdate.mockResolvedValue({});
  });

  it("persists a valid provider choice behind the system-admin gate", async () => {
    await saveAiScoringProvider(form("anthropic"));

    expect(mocks.requireCurrentUserPermission).toHaveBeenCalledWith("backend_jobs:manage");
    expect(mocks.assertCanPersistSettings).toHaveBeenCalled();
    expect(mocks.workspaceUpdate).toHaveBeenCalledWith({
      where: { id: "ws1" },
      data: { aiScoringProvider: "anthropic" }
    });
    expect(mocks.auditLog).toHaveBeenCalledTimes(1);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/ai-scoring");
  });

  it.each(["auto", "yandexgpt", "anthropic", "openai", "deterministic"])(
    "accepts the allowed choice %s",
    async (choice) => {
      await saveAiScoringProvider(form(choice));
      expect(mocks.workspaceUpdate).toHaveBeenCalledWith({ where: { id: "ws1" }, data: { aiScoringProvider: choice } });
    }
  );

  it("rejects an unknown provider and does not write", async () => {
    await expect(saveAiScoringProvider(form("gemini"))).rejects.toThrow();
    expect(mocks.workspaceUpdate).not.toHaveBeenCalled();
  });

  it("rejects a missing provider field", async () => {
    await expect(saveAiScoringProvider(form(undefined))).rejects.toThrow();
    expect(mocks.workspaceUpdate).not.toHaveBeenCalled();
  });
});
