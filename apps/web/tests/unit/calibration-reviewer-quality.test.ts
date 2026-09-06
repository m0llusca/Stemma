import { describe, expect, it } from "vitest";
import {
  aggregateReviewerVolume,
  listLowAgreementCalibrationItems,
  type ReviewerQualityCalibrationItemInput
} from "@/lib/calibration/reviewer-quality";

const criteria = [
  { id: "c1", kind: "SCALE_1_3" as const },
  { id: "c2", kind: "PASS_FAIL" as const }
];

function scale(criterionId: string, value: number) {
  return { criterionId, value, passed: null, isNotApplicable: false };
}

function pass(criterionId: string, passed: boolean) {
  return { criterionId, value: null, passed, isNotApplicable: false };
}

function item(
  partial: Partial<ReviewerQualityCalibrationItemInput> &
    Pick<ReviewerQualityCalibrationItemInput, "conversationId" | "participants" | "totalScores">
): ReviewerQualityCalibrationItemInput {
  return {
    sessionId: partial.sessionId ?? "session-1",
    sessionName: partial.sessionName ?? "Калибровка",
    conversationId: partial.conversationId,
    conversationSubject: partial.conversationSubject ?? `Тема ${partial.conversationId}`,
    conversationExternalId: partial.conversationExternalId ?? partial.conversationId,
    criteria: partial.criteria ?? criteria,
    participants: partial.participants,
    totalScores: partial.totalScores
  };
}

describe("listLowAgreementCalibrationItems", () => {
  it("surfaces pairs with low criterion agreement and sorts worst first", () => {
    const rows = listLowAgreementCalibrationItems([
      item({
        conversationId: "aligned",
        participants: [
          { scores: [scale("c1", 3), pass("c2", true)] },
          { scores: [scale("c1", 3), pass("c2", true)] }
        ],
        totalScores: [90, 92]
      }),
      item({
        conversationId: "split",
        conversationExternalId: "ext-split",
        participants: [
          { scores: [scale("c1", 1), pass("c2", true)] },
          { scores: [scale("c1", 3), pass("c2", false)] }
        ],
        totalScores: [60, 90]
      })
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.conversationId).toBe("split");
    expect(rows[0]?.overallAgreementRate).toBeLessThan(0.75);
    expect(rows[0]?.scoreSpread).toBe(30);
    expect(rows[0]?.misalignedCriteria).toBeGreaterThan(0);
  });

  it("flags high total-score spread even when criterion modal agreement is high", () => {
    const rows = listLowAgreementCalibrationItems([
      item({
        conversationId: "spread-only",
        // Same answers on available criteria, but totals diverge widely (e.g. N/A mix).
        participants: [
          { scores: [scale("c1", 3), pass("c2", true)] },
          { scores: [scale("c1", 3), pass("c2", true)] }
        ],
        totalScores: [50, 95]
      })
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.scoreSpread).toBe(45);
    expect(rows[0]?.overallAgreementRate).toBe(1);
  });

  it("skips conversations with fewer than two calibration participants", () => {
    const rows = listLowAgreementCalibrationItems([
      item({
        conversationId: "solo",
        participants: [{ scores: [scale("c1", 1)] }],
        totalScores: [40]
      })
    ]);

    expect(rows).toEqual([]);
  });
});

describe("aggregateReviewerVolume", () => {
  it("counts HUMAN finalize volume per analyst and caps the list", () => {
    const rows = aggregateReviewerVolume(
      [
        { reviewerId: "a", reviewerName: "Анна" },
        { reviewerId: "b", reviewerName: "Борис" },
        { reviewerId: "a", reviewerName: "Анна" },
        { reviewerId: "c", reviewerName: "Вера" },
        { reviewerId: "b", reviewerName: "Борис" },
        { reviewerId: "b", reviewerName: "Борис" }
      ],
      2
    );

    expect(rows).toEqual([
      { reviewerId: "b", reviewerName: "Борис", count: 3 },
      { reviewerId: "a", reviewerName: "Анна", count: 2 }
    ]);
  });
});
