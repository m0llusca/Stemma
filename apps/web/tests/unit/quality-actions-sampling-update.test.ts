import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  canManageSamplingRules: vi.fn(),
  assertCanPersistSettings: vi.fn(),
  updateMany: vi.fn(),
  create: vi.fn(),
  auditLog: vi.fn(),
  revalidatePath: vi.fn()
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
  canManageTraining: vi.fn(),
  canManageSamplingRules: mocks.canManageSamplingRules,
  assertCanPersistSettings: mocks.assertCanPersistSettings
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    samplingRule: { updateMany: mocks.updateMany, create: mocks.create }
  }
}));

vi.mock("@/lib/audit", () => ({
  auditLog: mocks.auditLog
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath
}));

import { updateSamplingRule } from "@/lib/quality-actions";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

const validFields = {
  ruleId: "rule-1",
  name: "Негативный CSAT в чате",
  type: "csat",
  channel: "chat",
  csatBucket: "low",
  supportLine: "1ЛП",
  tag: "vip",
  targetPercent: "35",
  priority: "5",
  isActive: "on"
};

describe("updateSamplingRule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "u1", workspaceId: "ws1", role: "QA_LEAD", name: "Лид" });
    mocks.canManageSamplingRules.mockReturnValue(true);
    mocks.assertCanPersistSettings.mockResolvedValue(undefined);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.auditLog.mockResolvedValue({ id: "audit-1" });
  });

  it("обновляет поля правила строго в пределах workspace текущего пользователя", async () => {
    await updateSamplingRule(form(validFields));

    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "rule-1", workspaceId: "ws1" },
      data: {
        name: "Негативный CSAT в чате",
        type: "csat",
        conditionsJson: JSON.stringify({ channel: "chat", csatBucket: "low", supportLine: "1ЛП", tag: "vip" }),
        targetPercent: 35,
        priority: 5,
        isActive: true
      }
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/sampling");
  });

  it("парсит поля как create: дефолт type=manual, выключенный isActive, пустые числа → 0", async () => {
    // Паритет с createSamplingRule: Number("") === 0, поэтому пустые числовые
    // поля дают 0, а не фолбэк — фолбэк срабатывает только на нечисловом вводе.
    await updateSamplingRule(form({ ruleId: "rule-1", name: "Минимум" }));

    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "rule-1", workspaceId: "ws1" },
      data: {
        name: "Минимум",
        type: "manual",
        conditionsJson: JSON.stringify({}),
        targetPercent: 0,
        priority: 0,
        isActive: false
      }
    });
  });

  it("нечисловые targetPercent/priority падают на фолбэки create (10/100)", async () => {
    await updateSamplingRule(form({ ruleId: "rule-1", name: "Минимум", targetPercent: "abc", priority: "xyz" }));

    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ targetPercent: 10, priority: 100 })
      })
    );
  });

  it("пишет audit-запись sampling_rule.updated", async () => {
    await updateSamplingRule(form(validFields));

    expect(mocks.auditLog).toHaveBeenCalledTimes(1);
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws1",
        actorId: "u1",
        action: "sampling_rule.updated",
        targetType: "sampling_rule",
        targetId: "rule-1"
      })
    );
  });

  it("отклоняет вызов без прав на правила выборки и не пишет в БД", async () => {
    mocks.canManageSamplingRules.mockReturnValue(false);

    await expect(updateSamplingRule(form(validFields))).rejects.toThrow("Нет прав на правила выборки.");
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.auditLog).not.toHaveBeenCalled();
  });

  it("падает без ruleId и не трогает БД", async () => {
    const { ruleId: _omitted, ...rest } = validFields;

    await expect(updateSamplingRule(form(rest))).rejects.toThrow();
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.auditLog).not.toHaveBeenCalled();
  });

  it("не даёт править чужой workspace: count=0 → ошибка, audit не пишется", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });

    await expect(updateSamplingRule(form(validFields))).rejects.toThrow("Правило не найдено.");
    expect(mocks.auditLog).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
