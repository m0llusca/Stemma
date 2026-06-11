import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const prisma = {
    $transaction: vi.fn(),
    scorecard: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn()
    },
    scorecardCriterion: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn()
    }
  };

  return {
    auditLog: vi.fn(),
    assertCanPersistSettings: vi.fn(),
    prisma,
    getCurrentUser: vi.fn(),
    redirect: vi.fn(),
    revalidatePath: vi.fn()
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect
}));

vi.mock("@/lib/audit", () => ({
  auditLog: mocks.auditLog
}));

vi.mock("@/lib/current-user", () => ({
  assertCanPersistSettings: mocks.assertCanPersistSettings,
  canManageScorecards: (role: string) => role === "ADMIN",
  getCurrentUser: mocks.getCurrentUser
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

function adminUser() {
  return {
    id: "admin-1",
    workspaceId: "workspace-1",
    role: "ADMIN"
  };
}

function validScorecardFormData() {
  const formData = new FormData();
  formData.set("scorecardId", "scorecard-1");
  formData.set("name", "Текущая методика");
  formData.set("criterionCount", "1");
  formData.set("criterion.0.id", "criterion-1");
  formData.set("criterion.0.key", "tone");
  formData.set("criterion.0.label", "Тон общения");
  formData.set("criterion.0.block", "Коммуникация");
  formData.set("criterion.0.kind", "SCALE_1_3");
  formData.set("criterion.0.weight", "100");
  formData.set("criterion.0.required", "on");
  return formData;
}

describe("scorecard actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertCanPersistSettings.mockResolvedValue(undefined);
    mocks.getCurrentUser.mockResolvedValue(adminUser());
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
    mocks.prisma.scorecard.findFirst.mockResolvedValue({
      id: "scorecard-1",
      version: 3,
      isActive: true,
      criteria: [{ id: "criterion-1" }]
    });
    mocks.prisma.scorecard.update.mockResolvedValue({
      id: "scorecard-1",
      version: 3
    });
    mocks.prisma.scorecardCriterion.update.mockResolvedValue({
      id: "criterion-1"
    });
    mocks.auditLog.mockResolvedValue({});
  });

  it("updates the active scorecard in place without creating a new version", async () => {
    const { updateScorecardVersion } = await import("@/lib/scorecard-actions");

    await updateScorecardVersion(validScorecardFormData());

    expect(mocks.prisma.scorecard.findFirst).toHaveBeenCalledWith({
      where: {
        id: "scorecard-1",
        workspaceId: "workspace-1",
        isActive: true
      },
      include: {
        criteria: {
          select: { id: true }
        }
      }
    });
    expect(mocks.prisma.scorecard.create).not.toHaveBeenCalled();
    expect(mocks.prisma.scorecard.update).toHaveBeenCalledWith({
      where: { id: "scorecard-1" },
      data: { name: "Текущая методика" },
      select: { id: true, version: true }
    });
    expect(mocks.prisma.scorecardCriterion.update).toHaveBeenCalledWith({
      where: { id: "criterion-1" },
      data: {
        key: "tone",
        label: "Тон общения",
        block: "Коммуникация",
        kind: "SCALE_1_3",
        weight: 100,
        required: true,
        order: 1
      }
    });
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "scorecard.version_updated",
        targetType: "scorecard",
        targetId: "scorecard-1",
        metadata: expect.objectContaining({ version: 3 })
      }),
      mocks.prisma
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/scorecards");
    expect(mocks.redirect).toHaveBeenCalledWith("/admin/scorecards?section=overview");
  });

  it("computes the next version inside the transaction when creating a scorecard version", async () => {
    const { createScorecardVersion } = await import("@/lib/scorecard-actions");
    mocks.prisma.scorecard.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.scorecard.create.mockResolvedValue({ id: "scorecard-new" });

    await createScorecardVersion(validScorecardFormData());

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.scorecard.findFirst).toHaveBeenCalledWith({
      where: { workspaceId: "workspace-1" },
      orderBy: { version: "desc" },
      select: { version: true }
    });
    expect(mocks.prisma.scorecard.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ version: 4, isActive: true })
      })
    );
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "scorecard.version_created",
        metadata: expect.objectContaining({ version: 4 })
      }),
      mocks.prisma
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/admin/scorecards");
  });

  it("retries once with a recomputed version when the unique version constraint rejects a duplicate", async () => {
    const { createScorecardVersion } = await import("@/lib/scorecard-actions");
    const conflict = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    mocks.prisma.scorecard.findFirst
      .mockResolvedValueOnce({ version: 3 })
      .mockResolvedValueOnce({ version: 4 });
    mocks.prisma.scorecard.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.scorecard.create
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce({ id: "scorecard-new" });

    await createScorecardVersion(validScorecardFormData());

    expect(mocks.prisma.scorecard.findFirst).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.scorecard.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: expect.objectContaining({ version: 4 }) })
    );
    expect(mocks.prisma.scorecard.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ data: expect.objectContaining({ version: 5 }) })
    );
    expect(mocks.auditLog).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).toHaveBeenCalledWith("/admin/scorecards");
  });

  it("does not retry scorecard version creation on non-unique errors", async () => {
    const { createScorecardVersion } = await import("@/lib/scorecard-actions");
    mocks.prisma.scorecard.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.scorecard.create.mockRejectedValue(new Error("База данных недоступна."));

    await expect(createScorecardVersion(validScorecardFormData())).rejects.toThrow("База данных недоступна.");

    expect(mocks.prisma.scorecard.create).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("surfaces the unique constraint error when the retry also collides", async () => {
    const { createScorecardVersion } = await import("@/lib/scorecard-actions");
    const conflict = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    mocks.prisma.scorecard.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.scorecard.create.mockRejectedValue(conflict);

    await expect(createScorecardVersion(validScorecardFormData())).rejects.toThrow("Unique constraint failed");

    expect(mocks.prisma.scorecard.create).toHaveBeenCalledTimes(2);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
