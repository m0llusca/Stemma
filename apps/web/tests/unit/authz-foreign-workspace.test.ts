import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    apiToken: {
      findFirst: vi.fn(),
      update: vi.fn()
    },
    review: {
      findFirst: vi.fn()
    },
    scorecard: {
      findFirst: vi.fn()
    },
    conversation: {
      count: vi.fn()
    },
    user: {
      count: vi.fn()
    }
  },
  getCurrentUser: vi.fn(),
  assertCanPersistSettings: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("@/lib/current-user", async () => {
  const actual = await vi.importActual<typeof import("@/lib/current-user")>("@/lib/current-user");
  return {
    ...actual,
    getCurrentUser: mocks.getCurrentUser,
    assertCanPersistSettings: mocks.assertCanPersistSettings
  };
});

describe("authz foreign workspace writes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({
      id: "user-1",
      workspaceId: "workspace-1",
      role: "ADMIN",
      name: "Admin"
    });
    mocks.assertCanPersistSettings.mockResolvedValue(undefined);
  });

  it("refuses to revoke an API token that belongs to another workspace", async () => {
    mocks.prisma.apiToken.findFirst.mockResolvedValue(null);

    const { revokeApiToken } = await import("@/lib/api-token-service");

    await expect(
      revokeApiToken({
        workspaceId: "workspace-1",
        tokenId: "token-from-workspace-2"
      })
    ).rejects.toThrow("API-токен не найден.");

    expect(mocks.prisma.apiToken.findFirst).toHaveBeenCalledWith({
      where: {
        id: "token-from-workspace-2",
        workspaceId: "workspace-1"
      }
    });
    expect(mocks.prisma.apiToken.update).not.toHaveBeenCalled();
  });

  it("revokes only when the token is scoped to the actor workspace", async () => {
    mocks.prisma.apiToken.findFirst.mockResolvedValue({
      id: "token-1",
      workspaceId: "workspace-1"
    });
    mocks.prisma.apiToken.update.mockResolvedValue({ id: "token-1" });

    const { revokeApiToken } = await import("@/lib/api-token-service");
    await revokeApiToken({ workspaceId: "workspace-1", tokenId: "token-1" });

    expect(mocks.prisma.apiToken.update).toHaveBeenCalledWith({
      where: { id: "token-1" },
      data: expect.objectContaining({
        lastError: "Token revoked by administrator."
      })
    });
  });

  it("scopes feedback review loads to the actor workspace", async () => {
    mocks.prisma.review.findFirst.mockResolvedValue(null);

    const { updateReviewFeedback } = await import("@/lib/feedback-actions");
    const formData = new FormData();
    formData.set("reviewId", "review-foreign");
    formData.set("action", "acknowledged");
    formData.set("comment", "");

    await expect(updateReviewFeedback(formData)).rejects.toThrow("Проверка не найдена.");

    expect(mocks.prisma.review.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "review-foreign", workspaceId: "workspace-1" }
      })
    );
  });

  it("rejects calibration sessions that pull conversations from another workspace", async () => {
    mocks.prisma.scorecard.findFirst.mockResolvedValue({ id: "scorecard-1" });
    mocks.prisma.conversation.count.mockResolvedValue(0);
    mocks.prisma.user.count.mockResolvedValue(1);

    const { createCalibrationSession } = await import("@/lib/calibration-actions");
    const formData = new FormData();
    formData.set("name", "Калибровка");
    formData.append("conversationId", "conversation-foreign");
    formData.append("participantId", "user-1");

    await expect(createCalibrationSession(formData)).rejects.toThrow(
      "Диалоги калибровки должны принадлежать текущему рабочему пространству."
    );
  });

  it("refuses scorecard edits outside the actor workspace", async () => {
    mocks.prisma.scorecard.findFirst.mockResolvedValue(null);

    const { updateScorecardVersion } = await import("@/lib/scorecard-actions");
    const formData = new FormData();
    formData.set("scorecardId", "scorecard-foreign");
    formData.set("name", "Форма");
    formData.set("criterionCount", "1");
    formData.set("criterion.0.key", "c1");
    formData.set("criterion.0.label", "Критерий");
    formData.set("criterion.0.kind", "SCALE_1_3");
    formData.set("criterion.0.weight", "100");
    formData.set("criterion.0.block", "Блок");
    formData.set("criterion.0.required", "on");

    await expect(updateScorecardVersion(formData)).rejects.toThrow(
      "Активная форма оценки не найдена или уже не доступна для редактирования."
    );

    expect(mocks.prisma.scorecard.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "scorecard-foreign",
          workspaceId: "workspace-1"
        })
      })
    );
  });
});
