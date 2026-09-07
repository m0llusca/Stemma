import { describe, expect, it, vi } from "vitest";
import {
  findLatestReopenedAt,
  findPendingFinalizedReopenRequest,
  recordReviewEvent,
  reviewEventActionLabel
} from "@/lib/review-events";

describe("review event recorder", () => {
  it("localizes seeded and workflow event actions", () => {
    expect(reviewEventActionLabel("qa.reopened")).toBe("Проверка возвращена в работу");
    expect(reviewEventActionLabel("qa.reopen_requested")).toBe("Запрошено переоткрытие проверки");
    expect(reviewEventActionLabel("conversation.workflow_updated")).toBe("Маршрут проверки обновлен");
    expect(reviewEventActionLabel("calibration.appeal_signal")).toBe("Сигнал калибровки по апелляции");
    expect(reviewEventActionLabel("review.feedback.appeal_corrected")).toBe("Апелляция скорректирована");
    expect(reviewEventActionLabel("unknown.action")).toBe("unknown.action");
  });

  it("stores metadata as JSON and preserves lifecycle statuses", async () => {
    const client = {
      reviewEvent: {
        create: vi.fn().mockResolvedValue({ id: "event-1" })
      }
    };

    await recordReviewEvent(client, {
      workspaceId: "workspace-1",
      reviewId: "review-1",
      conversationId: "conversation-1",
      actorId: "user-1",
      action: "review.finalized",
      fromStatus: "DRAFT",
      toStatus: "FINALIZED",
      metadata: { totalScore: 88 }
    });

    expect(client.reviewEvent.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace-1",
        reviewId: "review-1",
        conversationId: "conversation-1",
        actorId: "user-1",
        action: "review.finalized",
        fromStatus: "DRAFT",
        toStatus: "FINALIZED",
        metadata: JSON.stringify({ totalScore: 88 })
      }
    });
  });

  it("returns the latest REOPENED event timestamp for the conversation", async () => {
    const createdAt = new Date("2026-05-09T12:00:00.000Z");
    const client = {
      reviewEvent: {
        findFirst: vi.fn().mockResolvedValue({ createdAt })
      }
    };

    await expect(findLatestReopenedAt(client, "workspace-1", "conversation-1")).resolves.toEqual(createdAt);

    expect(client.reviewEvent.findFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace-1",
        conversationId: "conversation-1",
        toStatus: "REOPENED"
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true }
    });
  });

  it("returns null when the conversation was never reopened", async () => {
    const client = {
      reviewEvent: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    };

    await expect(findLatestReopenedAt(client, "workspace-1", "conversation-1")).resolves.toBeNull();
  });

  it("returns a pending reopen request newer than the last applied reopen", async () => {
    const requestedAt = new Date("2026-09-07T12:00:00.000Z");
    const client = {
      reviewEvent: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            actorId: "manager-1",
            metadata: JSON.stringify({ reason: "Калибровка", requestedById: "manager-1" }),
            createdAt: requestedAt
          })
          .mockResolvedValueOnce({ createdAt: new Date("2026-09-01T12:00:00.000Z") })
      }
    };

    await expect(findPendingFinalizedReopenRequest(client, "workspace-1", "conversation-1")).resolves.toEqual({
      reason: "Калибровка",
      requestedById: "manager-1",
      requestedAt
    });
  });

  it("ignores reopen requests that were already confirmed", async () => {
    const client = {
      reviewEvent: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            actorId: "manager-1",
            metadata: JSON.stringify({ reason: "Калибровка", requestedById: "manager-1" }),
            createdAt: new Date("2026-09-01T12:00:00.000Z")
          })
          .mockResolvedValueOnce({ createdAt: new Date("2026-09-07T12:00:00.000Z") })
      }
    };

    await expect(findPendingFinalizedReopenRequest(client, "workspace-1", "conversation-1")).resolves.toBeNull();
  });
});
