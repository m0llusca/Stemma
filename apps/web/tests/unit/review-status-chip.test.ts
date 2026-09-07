import { describe, expect, it } from "vitest";
import type { QaStatus } from "@prisma/client";
import { qaStatusLabels, reviewQueueStatusLabels } from "@/lib/labels";
import {
  pendingReopenLabel,
  qaStatusToReviewState,
  resolveQueueStatusChip,
  reviewStateLabels
} from "@/lib/review-state";

describe("status vocabulary", () => {
  it("uses one dictionary for qaStatus labels and review-state chips", () => {
    const statuses = Object.keys(qaStatusToReviewState) as QaStatus[];

    expect(statuses.length).toBeGreaterThan(0);

    for (const status of statuses) {
      expect(qaStatusLabels[status]).toBe(reviewStateLabels[qaStatusToReviewState[status]]);
    }

    expect(qaStatusLabels.ASSIGNED).toBe("Назначена");
    expect(qaStatusLabels.FINALIZED).toBe("Завершена");
    expect(qaStatusLabels.ASSIGNED).not.toBe("Назначено");
    expect(qaStatusLabels.FINALIZED).not.toBe("Завершено");
  });

  it("keeps queue «Итог» words off the status-chip dictionary", () => {
    const chipWords = new Set(Object.values(reviewStateLabels));

    expect(reviewQueueStatusLabels.unreviewed).toBe("Ещё не проверена");
    expect(reviewQueueStatusLabels.reviewed).toBe("Проверка завершена");
    expect(chipWords.has(reviewQueueStatusLabels.unreviewed)).toBe(false);
    expect(chipWords.has(reviewQueueStatusLabels.reviewed)).toBe(false);
    expect(reviewQueueStatusLabels.unreviewed).not.toBe(reviewStateLabels.queued);
    expect(reviewQueueStatusLabels.reviewed).not.toBe(reviewStateLabels.finalized);
  });
});

describe("resolveQueueStatusChip", () => {
  it("matches queue and preview chip labels for each stored qaStatus", () => {
    expect(resolveQueueStatusChip({ qaStatus: "QUEUED", reviews: [], pendingReopen: null }).label).toBe(
      reviewStateLabels.queued
    );
    expect(resolveQueueStatusChip({ qaStatus: "ASSIGNED", reviews: [], pendingReopen: null }).label).toBe(
      reviewStateLabels.assigned
    );
    expect(resolveQueueStatusChip({ qaStatus: "IN_PROGRESS", reviews: [], pendingReopen: null }).label).toBe(
      reviewStateLabels.in_progress
    );
    expect(
      resolveQueueStatusChip({
        qaStatus: "FINALIZED",
        reviews: [{ status: "FINALIZED", reviewSource: "HUMAN" }],
        pendingReopen: null
      }).label
    ).toBe(reviewStateLabels.finalized);
    expect(resolveQueueStatusChip({ qaStatus: "REOPENED", reviews: [], pendingReopen: null }).label).toBe(
      reviewStateLabels.reopened
    );
  });

  it("derives in-progress from a human draft the same way as the queue chip", () => {
    const chip = resolveQueueStatusChip({
      qaStatus: "QUEUED",
      reviews: [{ status: "DRAFT", reviewSource: "HUMAN" }],
      pendingReopen: null
    });

    expect(chip.state).toBe("in_progress");
    expect(chip.label).toBe(reviewStateLabels.in_progress);
    expect(chip.tone).toBe("accent");
  });

  it("uses the pending-reopen chip instead of a second finalized wording", () => {
    const chip = resolveQueueStatusChip({
      qaStatus: "FINALIZED",
      reviews: [{ status: "FINALIZED", reviewSource: "HUMAN" }],
      pendingReopen: {
        reason: "нужна правка",
        requestedById: "user-2",
        requestedByName: "Анна",
        requestedAt: "2026-09-07T00:00:00.000Z"
      }
    });

    expect(chip.label).toBe(pendingReopenLabel);
    expect(chip.tone).toBe("warning");
    expect(chip.label).not.toBe(qaStatusLabels.FINALIZED);
  });
});
