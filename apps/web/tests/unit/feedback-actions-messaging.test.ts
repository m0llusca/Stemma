import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    trainingAssignment: {
      create: vi.fn()
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

function managerUser() {
  return {
    id: "manager-1",
    workspaceId: "workspace-1",
    role: "TEAM_LEAD",
    name: "Тимлид"
  };
}

function reviewRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "review-1",
    conversationId: "conversation-1",
    status: "FINALIZED",
    feedbackStatus: "new",
    appealStatus: "none",
    reanswerStatus: "not_needed",
    conversation: { assigneeName: "Оператор" },
    ...overrides
  };
}

describe("feedback action messaging emitters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx));
    mocks.getCurrentUser.mockResolvedValue(managerUser());
    mocks.canAcknowledgeFeedback.mockReturnValue(true);
    mocks.canManageTraining.mockReturnValue(true);
    mocks.prisma.review.findFirst.mockResolvedValue(reviewRecord());
    mocks.prisma.user.findFirst.mockResolvedValue({ id: "agent-1", name: "Оператор" });
    mocks.tx.trainingAssignment.create.mockResolvedValue({ id: "assignment-1" });
    mocks.tx.review.update.mockResolvedValue({ id: "review-1" });
    mocks.tx.reviewFeedbackEvent.create.mockResolvedValue({ id: "event-1" });
    mocks.auditLog.mockResolvedValue({});
    mocks.recordReviewEvent.mockResolvedValue({});
    mocks.enqueueBackendJob.mockResolvedValue({ id: "job-1" });
  });

  it("enqueues a training.assigned job for the assignee from createTrainingAssignmentFromReview", async () => {
    const { createTrainingAssignmentFromReview } = await import("@/lib/feedback-actions");
    const formData = new FormData();
    formData.set("reviewId", "review-1");
    formData.set("title", "Работа с возражениями");
    formData.set("description", "Пройти модуль");
    formData.set("assigneeName", "Оператор");

    await createTrainingAssignmentFromReview(formData);

    expect(mocks.enqueueBackendJob).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueBackendJob).toHaveBeenCalledWith(
      {
        workspaceId: "workspace-1",
        type: "MESSAGING_DELIVERY",
        payload: {
          eventType: "training.assigned",
          recipientType: "assignee",
          recipientRef: "Оператор",
          context: {
            title: "Назначена учебная задача",
            body: "Оператор: Работа с возражениями",
            href: "/coaching"
          }
        }
      },
      mocks.tx
    );
  });

  it("enqueues a training.assigned job for the assignee from createTrainingAssignment", async () => {
    const { createTrainingAssignment } = await import("@/lib/feedback-actions");
    const formData = new FormData();
    formData.set("assigneeName", "Оператор");
    formData.set("title", "Тон общения");
    formData.set("description", "Изучить гайд");

    await createTrainingAssignment(formData);

    expect(mocks.enqueueBackendJob).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueBackendJob).toHaveBeenCalledWith(
      {
        workspaceId: "workspace-1",
        type: "MESSAGING_DELIVERY",
        payload: {
          eventType: "training.assigned",
          recipientType: "assignee",
          recipientRef: "Оператор",
          context: {
            title: "Назначена учебная задача",
            body: "Оператор: Тон общения",
            href: "/coaching"
          }
        }
      },
      mocks.tx
    );
  });

  it("uses the resolved user name as the assignee ref when assigneeId is provided", async () => {
    const { createTrainingAssignment } = await import("@/lib/feedback-actions");
    mocks.prisma.user.findFirst.mockResolvedValue({ id: "agent-7", name: "Анна" });
    const formData = new FormData();
    formData.set("assigneeId", "agent-7");
    formData.set("title", "Скрипт приветствия");
    formData.set("description", "Проговорить вслух");

    await createTrainingAssignment(formData);

    expect(mocks.enqueueBackendJob).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          recipientRef: "Анна",
          context: expect.objectContaining({
            body: "Анна: Скрипт приветствия"
          })
        })
      }),
      mocks.tx
    );
  });

  it("enqueues an appeal.opened job for the manager when an appeal is opened", async () => {
    const { updateReviewFeedback } = await import("@/lib/feedback-actions");
    const formData = new FormData();
    formData.set("reviewId", "review-1");
    formData.set("action", "appeal_opened");
    formData.set("comment", "Не согласен с оценкой");

    await updateReviewFeedback(formData);

    expect(mocks.enqueueBackendJob).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueBackendJob).toHaveBeenCalledWith(
      {
        workspaceId: "workspace-1",
        type: "MESSAGING_DELIVERY",
        payload: {
          eventType: "appeal.opened",
          recipientType: "manager",
          context: {
            title: "Открыта апелляция",
            body: "Обращение Оператор",
            href: "/reviews/conversation-1"
          }
        }
      },
      mocks.tx
    );
  });

  it("does not enqueue a messaging job for non-appeal feedback actions", async () => {
    const { updateReviewFeedback } = await import("@/lib/feedback-actions");
    const formData = new FormData();
    formData.set("reviewId", "review-1");
    formData.set("action", "acknowledged");
    formData.set("comment", "Понятно");

    await updateReviewFeedback(formData);

    expect(mocks.enqueueBackendJob).not.toHaveBeenCalled();
  });
});
