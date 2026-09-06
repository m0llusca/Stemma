import { describe, expect, it } from "vitest";
import { mapScorePredictionToCriterionScores } from "@/lib/ai-quality/apply-score-draft";
import type { ConversationScorePrediction } from "@/lib/ai-quality/scoring/types";

const scorecard = [
  { id: "c-scale", key: "tone", kind: "SCALE_1_3" as const, label: "Тон", weight: 50 },
  { id: "c-pass", key: "policy", kind: "PASS_FAIL" as const, label: "Политика", weight: 50 }
];

describe("mapScorePredictionToCriterionScores", () => {
  it("maps predictions by criterionId onto CriterionScore rows", () => {
    const prediction: ConversationScorePrediction = {
      overallConfidence: 0.9,
      summary: "Хорошо",
      criteria: [
        {
          criterionId: "c-scale",
          criterionKey: "tone",
          value: 3,
          confidence: 0.9,
          rationale: "Вежливо",
          evidenceRef: "msg-1"
        },
        {
          criterionId: "c-pass",
          criterionKey: "policy",
          passed: true,
          confidence: 0.8,
          rationale: "Ок"
        }
      ]
    };

    const result = mapScorePredictionToCriterionScores({
      prediction,
      scorecardCriteria: scorecard,
      validMessageIds: new Set(["msg-1"])
    });

    expect(result.mappedCriterionIds).toEqual(["c-scale", "c-pass"]);
    expect(result.unmatchedScorecardIds).toEqual([]);
    expect(result.scores).toEqual([
      {
        criterionId: "c-scale",
        value: 3,
        passed: null,
        isNotApplicable: false,
        comment: "Вежливо",
        evidenceMessageId: "msg-1"
      },
      {
        criterionId: "c-pass",
        value: null,
        passed: true,
        isNotApplicable: false,
        comment: "Ок",
        evidenceMessageId: null
      }
    ]);
  });

  it("falls back to criterionKey when ids drifted and marks leftover scorecard rows N/A", () => {
    const prediction: ConversationScorePrediction = {
      overallConfidence: 0.7,
      summary: "Частично",
      criteria: [
        {
          criterionId: "old-id",
          criterionKey: "tone",
          value: 2,
          confidence: 0.7,
          rationale: "Нейтрально"
        },
        {
          criterionId: "orphan",
          criterionKey: "unknown",
          value: 1,
          confidence: 0.1,
          rationale: "Лишнее"
        }
      ]
    };

    const result = mapScorePredictionToCriterionScores({
      prediction,
      scorecardCriteria: scorecard,
      validMessageIds: new Set()
    });

    expect(result.mappedCriterionIds).toEqual(["c-scale"]);
    expect(result.unmatchedScorecardIds).toEqual(["c-pass"]);
    expect(result.unmappedPredictionIds).toEqual(["orphan"]);
    expect(result.scores.find((row) => row.criterionId === "c-pass")?.isNotApplicable).toBe(true);
  });

  it("drops invalid evidence refs and rejects malformed scale values as unmatched", () => {
    const prediction: ConversationScorePrediction = {
      overallConfidence: 0.5,
      summary: "",
      criteria: [
        {
          criterionId: "c-scale",
          criterionKey: "tone",
          value: 9,
          confidence: 0.5,
          rationale: "Сломано",
          evidenceRef: "missing-msg"
        },
        {
          criterionId: "c-pass",
          criterionKey: "policy",
          passed: false,
          confidence: 0.5,
          rationale: "Нет",
          evidenceRef: "missing-msg"
        }
      ]
    };

    const result = mapScorePredictionToCriterionScores({
      prediction,
      scorecardCriteria: scorecard,
      validMessageIds: new Set(["msg-1"])
    });

    expect(result.mappedCriterionIds).toEqual(["c-pass"]);
    expect(result.unmatchedScorecardIds).toEqual(["c-scale"]);
    expect(result.scores.find((row) => row.criterionId === "c-pass")).toMatchObject({
      passed: false,
      evidenceMessageId: null
    });
  });
});
