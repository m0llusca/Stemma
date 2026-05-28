import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditLog: vi.fn(),
  getCurrentUser: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    scorecard: {
      findFirst: vi.fn()
    },
    conversation: {
      count: vi.fn()
    },
    user: {
      count: vi.fn()
    },
    calibrationSession: {
      create: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn()
    }
  },
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  revalidatePath: vi.fn()
}));

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
  canManageCalibration: (role: string) => role === "ADMIN",
  getCurrentUser: mocks.getCurrentUser
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

describe("calibration actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({
      id: "admin-1",
      workspaceId: "workspace-1",
      role: "ADMIN"
    });
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
    mocks.prisma.scorecard.findFirst.mockResolvedValue({
      id: "scorecard-1"
    });
    mocks.prisma.conversation.count.mockResolvedValue(1);
    mocks.prisma.user.count.mockResolvedValue(1);
    mocks.prisma.calibrationSession.create.mockResolvedValue({
      id: "calibration-created"
    });
    mocks.prisma.calibrationSession.findFirst.mockResolvedValue({
      id: "calibration-1",
      status: "archived"
    });
    mocks.prisma.calibrationSession.updateMany.mockResolvedValue({ count: 1 });
  });

  it("does not allow archived calibration sessions to be completed", async () => {
    const { updateCalibrationSessionStatus } = await import("@/lib/calibration-actions");
    const formData = new FormData();
    formData.set("id", "calibration-1");
    formData.set("status", "completed");

    await expect(updateCalibrationSessionStatus(formData)).rejects.toThrow(
      "Архивную калибровку нельзя завершить. Верните ее в работу или оставьте в архиве."
    );

    expect(mocks.prisma.calibrationSession.updateMany).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects calibration conversations outside the current workspace before creating nested rows", async () => {
    const { createCalibrationSession } = await import("@/lib/calibration-actions");
    const formData = new FormData();
    formData.set("name", "Межкомандная калибровка");
    formData.append("conversationId", "conversation-current");
    formData.append("conversationId", "conversation-foreign");
    formData.append("participantId", "participant-current");
    mocks.prisma.conversation.count.mockResolvedValue(1);
    mocks.prisma.user.count.mockResolvedValue(1);

    await expect(createCalibrationSession(formData)).rejects.toThrow("Диалоги калибровки должны принадлежать текущему рабочему пространству.");

    expect(mocks.prisma.conversation.count).toHaveBeenCalledWith({
      where: {
        id: {
          in: ["conversation-current", "conversation-foreign"]
        },
        workspaceId: "workspace-1"
      }
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.prisma.calibrationSession.create).not.toHaveBeenCalled();
  });

  it("rejects calibration participants outside the current workspace before creating nested rows", async () => {
    const { createCalibrationSession } = await import("@/lib/calibration-actions");
    const formData = new FormData();
    formData.set("name", "Калибровка смены");
    formData.append("conversationId", "conversation-current");
    formData.append("participantId", "participant-current");
    formData.append("participantId", "participant-foreign");
    mocks.prisma.conversation.count.mockResolvedValue(1);
    mocks.prisma.user.count.mockResolvedValue(1);

    await expect(createCalibrationSession(formData)).rejects.toThrow("Участники калибровки должны принадлежать текущему рабочему пространству.");

    expect(mocks.prisma.user.count).toHaveBeenCalledWith({
      where: {
        id: {
          in: ["participant-current", "participant-foreign"]
        },
        workspaceId: "workspace-1"
      }
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.prisma.calibrationSession.create).not.toHaveBeenCalled();
  });
});
