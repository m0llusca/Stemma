import type { CriterionScore, ScorecardCriterion } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  aiAgreesWithDraft,
  criterionContribution,
  criterionStatus,
  isCriterionAnswered,
  isCriterionIssue,
  passFailDefaultValue,
  scaleDefaultValue
} from "@/components/review/review-criterion-scoring";
import type { CriterionPrediction } from "@/lib/ai-quality/scoring/types";

const passFailCriterion = {
  id: "c-pass",
  scorecardId: "sc-1",
  key: "resolution",
  label: "Решение",
  block: "Результат",
  kind: "PASS_FAIL",
  weight: 50,
  required: true,
  order: 1
} as ScorecardCriterion;

const scaleCriterion = {
  ...passFailCriterion,
  id: "c-scale",
  key: "tone",
  label: "Тон",
  kind: "SCALE_1_3",
  weight: 50
} as ScorecardCriterion;

function score(partial: Partial<CriterionScore> & { criterionId: string }): CriterionScore {
  return {
    id: "score-1",
    reviewId: "review-1",
    value: null,
    passed: null,
    isNotApplicable: false,
    comment: "",
    evidenceMessageId: null,
    ...partial
  };
}

function prediction(partial: Partial<CriterionPrediction>): CriterionPrediction {
  return {
    criterionId: "c-pass",
    criterionKey: "resolution",
    confidence: 0.9,
    rationale: "test",
    ...partial
  };
}

describe("review-criterion-scoring", () => {
  it("treats missing passed/value as unanswered, never as auto-pass", () => {
    expect(isCriterionAnswered(passFailCriterion, undefined)).toBe(false);
    expect(isCriterionAnswered(passFailCriterion, score({ criterionId: "c-pass", passed: null }))).toBe(false);
    expect(isCriterionAnswered(passFailCriterion, score({ criterionId: "c-pass", passed: true }))).toBe(true);

    expect(isCriterionAnswered(scaleCriterion, score({ criterionId: "c-scale", value: null }))).toBe(false);
    expect(isCriterionAnswered(scaleCriterion, score({ criterionId: "c-scale", value: 3 }))).toBe(true);
  });

  it("does not count unscored criteria toward contribution", () => {
    expect(criterionContribution(passFailCriterion, 100, undefined)).toBe(0);
    expect(criterionContribution(passFailCriterion, 100, score({ criterionId: "c-pass", passed: null }))).toBe(0);
    expect(criterionContribution(passFailCriterion, 100, score({ criterionId: "c-pass", passed: true }))).toBe(50);
    expect(criterionContribution(passFailCriterion, 100, score({ criterionId: "c-pass", passed: false }))).toBe(0);

    expect(criterionContribution(scaleCriterion, 100, score({ criterionId: "c-scale", value: null }))).toBe(0);
    expect(criterionContribution(scaleCriterion, 100, score({ criterionId: "c-scale", value: 3 }))).toBe(50);
    expect(criterionContribution(scaleCriterion, 100, score({ criterionId: "c-scale", value: 1 }))).toBeCloseTo(50 / 3);
  });

  it("does not treat unscored drafts as agreeing with AI pass predictions", () => {
    const aiPass = prediction({ passed: true });
    const aiScale3 = prediction({ criterionId: "c-scale", criterionKey: "tone", value: 3 });

    expect(aiAgreesWithDraft(passFailCriterion, aiPass, undefined)).toBe(false);
    expect(aiAgreesWithDraft(passFailCriterion, aiPass, score({ criterionId: "c-pass", passed: null }))).toBe(false);
    expect(aiAgreesWithDraft(passFailCriterion, aiPass, score({ criterionId: "c-pass", passed: true }))).toBe(true);
    expect(aiAgreesWithDraft(passFailCriterion, aiPass, score({ criterionId: "c-pass", passed: false }))).toBe(false);

    expect(aiAgreesWithDraft(scaleCriterion, aiScale3, undefined)).toBe(false);
    expect(aiAgreesWithDraft(scaleCriterion, aiScale3, score({ criterionId: "c-scale", value: null }))).toBe(false);
    expect(aiAgreesWithDraft(scaleCriterion, aiScale3, score({ criterionId: "c-scale", value: 3 }))).toBe(true);
  });

  it("labels unscored criteria as Не оценено instead of Зачет / 3/3", () => {
    expect(criterionStatus(passFailCriterion, undefined, "authoring")).toEqual({
      label: "Не оценено",
      tone: "neutral"
    });
    expect(criterionStatus(scaleCriterion, undefined, "authoring")).toEqual({
      label: "Не оценено",
      tone: "neutral"
    });
    expect(isCriterionIssue(passFailCriterion, undefined)).toBe(false);
    expect(isCriterionIssue(scaleCriterion, undefined)).toBe(false);
  });

  it("leaves radio defaults empty until an explicit verdict exists", () => {
    expect(passFailDefaultValue(undefined)).toBeUndefined();
    expect(passFailDefaultValue(score({ criterionId: "c-pass", passed: null }))).toBeUndefined();
    expect(passFailDefaultValue(score({ criterionId: "c-pass", passed: true }))).toBe("true");
    expect(passFailDefaultValue(score({ criterionId: "c-pass", passed: false }))).toBe("false");

    expect(scaleDefaultValue(undefined)).toBeUndefined();
    expect(scaleDefaultValue(score({ criterionId: "c-scale", value: null }))).toBeUndefined();
    expect(scaleDefaultValue(score({ criterionId: "c-scale", value: 2 }))).toBe("2");
  });
});
