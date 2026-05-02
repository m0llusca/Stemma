import { calculateReviewScore, type CriterionInput } from "@/lib/score";
import { describe, expect, it } from "vitest";

describe("calculateReviewScore", () => {
  it("calculates weighted score across SCALE_1_3 and PASS_FAIL criteria", () => {
    const criteria: CriterionInput[] = [
      {
        id: "accuracy",
        label: "Accuracy",
        type: "SCALE_1_3",
        weight: 40,
        score: 3
      },
      {
        id: "tone",
        label: "Tone",
        type: "SCALE_1_3",
        weight: 40,
        score: 2
      },
      {
        id: "compliance",
        label: "Compliance",
        type: "PASS_FAIL",
        weight: 20,
        passed: true
      }
    ];

    expect(calculateReviewScore(criteria)).toEqual({
      totalScore: 86.67,
      maxWeight: 100
    });
  });

  it("removes N/A criteria from denominator", () => {
    const criteria: CriterionInput[] = [
      {
        id: "accuracy",
        label: "Accuracy",
        type: "SCALE_1_3",
        weight: 50,
        score: 3
      },
      {
        id: "policy",
        label: "Policy",
        type: "PASS_FAIL",
        weight: 50,
        notApplicable: true
      }
    ];

    expect(calculateReviewScore(criteria)).toEqual({
      totalScore: 100,
      maxWeight: 50
    });
  });

  it("throws when a scale score is missing", () => {
    const criteria: CriterionInput[] = [
      {
        id: "accuracy",
        label: "Accuracy",
        type: "SCALE_1_3",
        weight: 50
      }
    ];

    expect(() => calculateReviewScore(criteria)).toThrow(
      "Missing scale score for accuracy"
    );
  });
});
