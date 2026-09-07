import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    trainingAssignment: {
      create: vi.fn(),
      updateMany: vi.fn()
    },
    review: {
      update: vi.fn()
    },
    reviewFeedbackEvent: {
      create: vi.fn()
    }
  };

  return {
    auditLog: vi.fn(),
    canAcknowledgeFeedback: vi.fn(),
    canManageReviewWorkflow: vi.fn(),
    canManageTraining: vi.fn(),
    enqueueBackendJob: vi.fn(),
    getCurrentUser: vi.fn(),
    recordReviewEvent: vi.fn(),
    revalidatePath: vi.fn(),
    prisma: {
      $transaction: vi.fn(),
      review: {
        findFirst: vi.fn()
      },
      user: {
        findFirst: vi.fn()
      },
      coachingAction: {
        findFirst: vi.fn()
      },
      trainingAssignment: {
        findFirst: vi.fn()
      }
    },
    tx
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath
}));

vi.mock("@/lib/audit", () => ({
  auditLog: mocks.auditLog
}));

vi.mock("@/lib/current-user", () => ({
  canAcknowledgeFeedback: mocks.canAcknowledgeFeedback,
  canManageReviewWorkflow: mocks.canManageReviewWorkflow,
  canManageTraining: mocks.canManageTraining,
  getCurrentUser: mocks.getCurrentUser
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("@/lib/review-events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/review-events")>();
  return {
    ...actual,
    recordReviewEvent: mocks.recordReviewEvent
  };
});

vi.mock("@/lib/jobs/enqueue", () => ({
  enqueueBackendJob: mocks.enqueueBackendJob
}));

function agentUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "agent-1",
    workspaceId: "workspace-1",
    role: "SUPPORT_AGENT",
    name: "Оператор",
    ...overrides
  };
}

function reviewRecord(overrides: Record<string, unknown> = {}) {
  const { conversation, ...rest } = overrides as {
    conversation?: Record<string, unknown>;
  } & Record<string, unknown>;
  return {
    id: "review-1",
    conversationId: "conversation-1",
    status: "FINALIZED",
    feedbackStatus: "new",
    appealStatus: "none",
    reanswerStatus: "not_needed",
    conversation: { assigneeName: "Оператор", assigneeId: "agent-1", ...conversation },
    ...rest
  };
}

describe("feedback action scope enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx));
    mocks.getCurrentUser.mockResolvedValue(agentUser());
    mocks.canAcknowledgeFeedback.mockReturnValue(true);
    mocks.canManageReviewWorkflow.mockReturnValue(false);
    // A SUPPORT_AGENT holds training:manage, so canManageTraining is true.
    mocks.canManageTraining.mockReturnValue(true);
    mocks.prisma.review.findFirst.mockResolvedValue(reviewRecord());
    mocks.prisma.user.findFirst.mockResolvedValue({ id: "agent-1", name: "Оператор" });
    mocks.prisma.coachingAction.findFirst.mockResolvedValue(null);
    mocks.prisma.trainingAssignment.findFirst.mockResolvedValue(null);
    mocks.tx.trainingAssignment.create.mockResolvedValue({ id: "assignment-1" });
    mocks.tx.trainingAssignment.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.review.update.mockResolvedValue({ id: "review-1" });
    mocks.tx.reviewFeedbackEvent.create.mockResolvedValue({ id: "event-1" });
    mocks.auditLog.mockResolvedValue({});
    mocks.recordReviewEvent.mockResolvedValue({});
    mocks.enqueueBackendJob.mockResolvedValue({ id: "job-1" });
  });

  // Finding #1: scope must key off assigneeId, not the (non-unique) name.
  it("blocks a support agent acting on a review whose conversation belongs to another agent id", async () => {
    const { updateReviewFeedback } = await import("@/lib/feedback-actions");
    // Same displayed name, but a different (unique) assigneeId — must be denied.
    mocks.prisma.review.findFirst.mockResolvedValue(
      reviewRecord({ conversation: { assigneeName: "Оператор", assigneeId: "agent-2" } })
    );
    const formData = new FormData();
    formData.set("reviewId", "review-1");
    formData.set("action", "acknowledged");

    await expect(updateReviewFeedback(formData)).rejects.toThrow(
      "Нет прав на работу с обратной связью по чужому обращению."
    );
    expect(mocks.tx.review.update).not.toHaveBeenCalled();
  });

  it("blocks a support agent when the conversation has no assignee id (fail-closed)", async () => {
    const { updateReviewFeedback } = await import("@/lib/feedback-actions");
    mocks.prisma.review.findFirst.mockResolvedValue(
      reviewRecord({ conversation: { assigneeName: "Оператор", assigneeId: null } })
    );
    const formData = new FormData();
    formData.set("reviewId", "review-1");
    formData.set("action", "acknowledged");

    await expect(updateReviewFeedback(formData)).rejects.toThrow(
      "Нет прав на работу с обратной связью по чужому обращению."
    );
    expect(mocks.tx.review.update).not.toHaveBeenCalled();
  });

  it("allows a support agent to act on their own review matched by assignee id", async () => {
    const { updateReviewFeedback } = await import("@/lib/feedback-actions");
    mocks.prisma.review.findFirst.mockResolvedValue(
      reviewRecord({ conversation: { assigneeName: "Тёзка", assigneeId: "agent-1" } })
    );
    const formData = new FormData();
    formData.set("reviewId", "review-1");
    formData.set("action", "acknowledged");

    await updateReviewFeedback(formData);

    expect(mocks.tx.review.update).toHaveBeenCalledTimes(1);
  });

  it("blocks a support agent from confirming their own appeal (TEAM_LEAD/ADMIN only)", async () => {
    const { updateReviewFeedback } = await import("@/lib/feedback-actions");
    mocks.prisma.review.findFirst.mockResolvedValue(
      reviewRecord({ feedbackStatus: "appeal", appealStatus: "open" })
    );
    const formData = new FormData();
    formData.set("reviewId", "review-1");
    formData.set("action", "appeal_confirmed");

    await expect(updateReviewFeedback(formData)).rejects.toThrow("Нет прав на решение по апелляции.");
    expect(mocks.tx.review.update).not.toHaveBeenCalled();
  });

  it("blocks a support agent from correcting their own appeal (TEAM_LEAD/ADMIN only)", async () => {
    const { updateReviewFeedback } = await import("@/lib/feedback-actions");
    mocks.prisma.review.findFirst.mockResolvedValue(
      reviewRecord({ feedbackStatus: "appeal", appealStatus: "open" })
    );
    const formData = new FormData();
    formData.set("reviewId", "review-1");
    formData.set("action", "appeal_corrected");

    await expect(updateReviewFeedback(formData)).rejects.toThrow("Нет прав на решение по апелляции.");
    expect(mocks.tx.review.update).not.toHaveBeenCalled();
  });

  it("blocks a QA analyst from resolving an appeal despite workflow:manage", async () => {
    const { updateReviewFeedback } = await import("@/lib/feedback-actions");
    mocks.getCurrentUser.mockResolvedValue(agentUser({ id: "qa-1", role: "QA_ANALYST", name: "Проверяющий" }));
    mocks.canManageReviewWorkflow.mockReturnValue(true);
    mocks.prisma.review.findFirst.mockResolvedValue(
      reviewRecord({ feedbackStatus: "appeal", appealStatus: "open" })
    );

    for (const action of ["appeal_confirmed", "appeal_corrected", "reanswer_requested"] as const) {
      mocks.tx.review.update.mockClear();
      const formData = new FormData();
      formData.set("reviewId", "review-1");
      formData.set("action", action);

      await expect(updateReviewFeedback(formData)).rejects.toThrow("Нет прав на решение по апелляции.");
      expect(mocks.tx.review.update).not.toHaveBeenCalled();
    }
  });

  it("allows a QA analyst to acknowledge feedback on other paths", async () => {
    const { updateReviewFeedback } = await import("@/lib/feedback-actions");
    mocks.getCurrentUser.mockResolvedValue(agentUser({ id: "qa-1", role: "QA_ANALYST", name: "Проверяющий" }));
    mocks.canManageReviewWorkflow.mockReturnValue(true);
    const formData = new FormData();
    formData.set("reviewId", "review-1");
    formData.set("action", "acknowledged");

    await updateReviewFeedback(formData);

    expect(mocks.tx.review.update).toHaveBeenCalledTimes(1);
  });

  it("opens an appeal confirmation as a calibration signal for TEAM_LEAD", async () => {
    const { updateReviewFeedback } = await import("@/lib/feedback-actions");
    const { CALIBRATION_APPEAL_SIGNAL_ACTION } = await import("@/lib/review-events");
    mocks.getCurrentUser.mockResolvedValue(agentUser({ id: "lead-1", role: "TEAM_LEAD", name: "Тимлид" }));
    mocks.canManageReviewWorkflow.mockReturnValue(true);
    mocks.prisma.review.findFirst.mockResolvedValue(
      reviewRecord({ feedbackStatus: "appeal", appealStatus: "open" })
    );
    const formData = new FormData();
    formData.set("reviewId", "review-1");
    formData.set("action", "appeal_confirmed");

    await updateReviewFeedback(formData);

    expect(mocks.tx.review.update).toHaveBeenCalledTimes(1);
    expect(mocks.recordReviewEvent).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({
        action: "review.feedback.appeal_confirmed"
      })
    );
    expect(mocks.recordReviewEvent).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({
        action: CALIBRATION_APPEAL_SIGNAL_ACTION,
        reviewId: "review-1",
        conversationId: "conversation-1",
        metadata: expect.objectContaining({
          appealOutcome: "confirmed",
          sourceAction: "appeal_confirmed"
        })
      })
    );
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "review.feedback.appeal_confirmed",
        metadata: expect.objectContaining({
          calibrationSignal: true,
          appealOutcome: "confirmed"
        })
      }),
      mocks.tx
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/calibration");
  });

  it("opens an appeal correction as a calibration signal for ADMIN", async () => {
    const { updateReviewFeedback } = await import("@/lib/feedback-actions");
    const { CALIBRATION_APPEAL_SIGNAL_ACTION } = await import("@/lib/review-events");
    mocks.getCurrentUser.mockResolvedValue(agentUser({ id: "admin-1", role: "ADMIN", name: "Админ" }));
    mocks.canManageReviewWorkflow.mockReturnValue(true);
    mocks.prisma.review.findFirst.mockResolvedValue(
      reviewRecord({ feedbackStatus: "appeal", appealStatus: "open" })
    );
    const formData = new FormData();
    formData.set("reviewId", "review-1");
    formData.set("action", "appeal_corrected");

    await updateReviewFeedback(formData);

    expect(mocks.recordReviewEvent).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({
        action: CALIBRATION_APPEAL_SIGNAL_ACTION,
        metadata: expect.objectContaining({
          appealOutcome: "corrected",
          sourceAction: "appeal_corrected"
        })
      })
    );
  });

  // Finding #2: updateTrainingAssignmentStatus must self-scope SUPPORT_AGENT.
  it("scopes a support agent's training status update to their own assignments", async () => {
    const { updateTrainingAssignmentStatus } = await import("@/lib/feedback-actions");
    const formData = new FormData();
    formData.set("id", "assignment-1");
    formData.set("status", "done");

    await updateTrainingAssignmentStatus(formData);

    expect(mocks.tx.trainingAssignment.updateMany).toHaveBeenCalledWith({
      where: { id: "assignment-1", workspaceId: "workspace-1", assigneeId: "agent-1" },
      data: { status: "done" }
    });
  });

  it("does not self-scope a manager's training status update", async () => {
    const { updateTrainingAssignmentStatus } = await import("@/lib/feedback-actions");
    mocks.getCurrentUser.mockResolvedValue(agentUser({ id: "lead-1", role: "TEAM_LEAD", name: "Тимлид" }));
    const formData = new FormData();
    formData.set("id", "assignment-1");
    formData.set("status", "done");

    await updateTrainingAssignmentStatus(formData);

    expect(mocks.tx.trainingAssignment.updateMany).toHaveBeenCalledWith({
      where: { id: "assignment-1", workspaceId: "workspace-1" },
      data: { status: "done" }
    });
  });

  // Finding #2: createTrainingAssignment must reject SUPPORT_AGENT.
  it("forbids a support agent from creating a training assignment", async () => {
    const { createTrainingAssignment } = await import("@/lib/feedback-actions");
    const formData = new FormData();
    formData.set("assigneeName", "Оператор");
    formData.set("title", "Тон общения");
    formData.set("description", "Изучить гайд");

    await expect(createTrainingAssignment(formData)).rejects.toThrow(
      "Нет прав на создание учебных задач."
    );
    expect(mocks.tx.trainingAssignment.create).not.toHaveBeenCalled();
  });
});
