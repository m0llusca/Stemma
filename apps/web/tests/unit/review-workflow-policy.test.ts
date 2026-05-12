import type { QaStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  QaWorkflowTransitionError,
  assertHumanReviewFinalizeTransition,
  assertQaWorkflowTransition,
  hasCurrentCycleFinalizedReview,
  isCurrentCycleFinalizedReview
} from "@/lib/review-workflow-policy";

const allowedTransitions: Array<[QaStatus, QaStatus]> = [
  ["QUEUED", "ASSIGNED"],
  ["QUEUED", "IN_PROGRESS"],
  ["ASSIGNED", "IN_PROGRESS"],
  ["ASSIGNED", "QUEUED"],
  ["IN_PROGRESS", "FINALIZED"],
  ["IN_PROGRESS", "REOPENED"],
  ["IN_PROGRESS", "QUEUED"],
  ["FINALIZED", "REOPENED"],
  ["REOPENED", "IN_PROGRESS"],
  ["REOPENED", "FINALIZED"]
];

describe("QA workflow transition policy", () => {
  it.each(allowedTransitions)("allows %s -> %s", (fromStatus, toStatus) => {
    expect(() =>
      assertQaWorkflowTransition({
        fromStatus,
        toStatus,
        hasFinalizedReview: toStatus === "FINALIZED"
      })
    ).not.toThrow();
  });

  it("allows no-op status updates except unsupported manual finalization", () => {
    expect(() =>
      assertQaWorkflowTransition({
        fromStatus: "ASSIGNED",
        toStatus: "ASSIGNED"
      })
    ).not.toThrow();

    expect(() =>
      assertQaWorkflowTransition({
        fromStatus: "FINALIZED",
        toStatus: "FINALIZED"
      })
    ).toThrow("Нельзя вручную завершить проверку без завершенного ревью.");
  });

  it("blocks unsupported transitions with a clear error", () => {
    expect(() =>
      assertQaWorkflowTransition({
        fromStatus: "QUEUED",
        toStatus: "FINALIZED",
        hasFinalizedReview: true
      })
    ).toThrow(QaWorkflowTransitionError);

    expect(() =>
      assertQaWorkflowTransition({
        fromStatus: "FINALIZED",
        toStatus: "IN_PROGRESS"
      })
    ).toThrow("Недопустимый переход состояния проверки: FINALIZED -> IN_PROGRESS.");
  });

  it("requires finalized review evidence before moving to FINALIZED", () => {
    expect(() =>
      assertQaWorkflowTransition({
        fromStatus: "IN_PROGRESS",
        toStatus: "FINALIZED"
      })
    ).toThrow("Нельзя вручную завершить проверку без завершенного ревью.");

    expect(() =>
      assertQaWorkflowTransition({
        fromStatus: "REOPENED",
        toStatus: "FINALIZED",
        hasFinalizedReview: true
      })
    ).not.toThrow();
  });

  it("blocks direct HUMAN finalization on an already finalized conversation", () => {
    expect(() => assertHumanReviewFinalizeTransition({ fromStatus: "FINALIZED" })).toThrow(
      "Завершенный диалог нужно сначала переоткрыть для нового цикла проверки."
    );

    expect(() => assertHumanReviewFinalizeTransition({ fromStatus: "REOPENED" })).not.toThrow();
  });

  it("accepts only current-cycle finalized HUMAN reviews as FINALIZED evidence", () => {
    const latestReopenedAt = new Date("2026-05-09T12:00:00.000Z");

    expect(
      isCurrentCycleFinalizedReview({
        status: "FINALIZED",
        reviewSource: "HUMAN",
        finalizedAt: new Date("2026-05-09T12:01:00.000Z"),
        latestReopenedAt
      })
    ).toBe(true);

    expect(
      isCurrentCycleFinalizedReview({
        status: "FINALIZED",
        reviewSource: "HUMAN",
        finalizedAt: new Date("2026-05-09T11:59:00.000Z"),
        latestReopenedAt
      })
    ).toBe(false);

    expect(
      hasCurrentCycleFinalizedReview(
        [
          {
            status: "FINALIZED",
            reviewSource: "AI",
            finalizedAt: new Date("2026-05-09T12:02:00.000Z")
          },
          {
            status: "FINALIZED",
            reviewSource: "HUMAN",
            finalizedAt: new Date("2026-05-09T11:58:00.000Z")
          }
        ],
        latestReopenedAt
      )
    ).toBe(false);
  });
});
