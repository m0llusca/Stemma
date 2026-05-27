import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditLog: vi.fn(),
  getCurrentUser: vi.fn(),
  prisma: {
    calibrationSession: {
      findFirst: vi.fn(),
      updateMany: vi.fn()
    }
  },
  revalidatePath: vi.fn()
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath
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
});
