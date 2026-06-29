import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  canManageTraining: vi.fn(),
  assertCanPersistSettings: vi.fn(),
  createKnowledgeRule: vi.fn(),
  revalidatePath: vi.fn()
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
  canManageTraining: mocks.canManageTraining,
  canManageSamplingRules: vi.fn(),
  assertCanPersistSettings: mocks.assertCanPersistSettings
}));

vi.mock("@/lib/db", () => ({
  prisma: { qualityKnowledgeEntry: { create: mocks.createKnowledgeRule } }
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath
}));

import { createKnowledgeEntryState } from "@/lib/quality-actions";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

describe("createKnowledgeEntryState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "u1", workspaceId: "ws1", role: "QA_LEAD", name: "Лид" });
    mocks.canManageTraining.mockReturnValue(true);
    mocks.assertCanPersistSettings.mockResolvedValue(undefined);
    mocks.createKnowledgeRule.mockResolvedValue({ id: "rule-1" });
  });

  it("returns a success toast state after saving a knowledge rule", async () => {
    const state = await createKnowledgeEntryState(
      null,
      form({
        category: "Полнота решения",
        riskLevel: "HIGH",
        title: "Передача без объяснения",
        description: "Оператор передаёт диалог без пояснения клиенту.",
        recommendation: "Объяснить клиенту причину передачи."
      })
    );

    expect(mocks.createKnowledgeRule).toHaveBeenCalledTimes(1);
    expect(state).toMatchObject({ ok: true, toast: "Правило сохранено." });
    if (state && state.ok) {
      expect(typeof state.nonce).toBe("number");
    }
  });

  it("returns an inline error state and skips the write when the rule is invalid", async () => {
    const state = await createKnowledgeEntryState(null, form({ riskLevel: "HIGH", title: "x" }));

    expect(mocks.createKnowledgeRule).not.toHaveBeenCalled();
    expect(state).toEqual({ ok: false, message: "Укажите категорию типовой ошибки." });
  });
});
