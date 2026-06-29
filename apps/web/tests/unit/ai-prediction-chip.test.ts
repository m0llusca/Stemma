import { describe, expect, it } from "vitest";
import type { CriterionPrediction } from "@/lib/ai-quality/scoring/types";
import { criterionPredictionChipLabel } from "@/components/review/ai-prediction-chip";

function prediction(overrides: Partial<CriterionPrediction>): CriterionPrediction {
  return {
    criterionId: "criterion-1",
    criterionKey: "tone",
    confidence: 0.86,
    rationale: "Тон корректный.",
    ...overrides
  };
}

describe("criterionPredictionChipLabel", () => {
  it("renders the scale value with a rounded confidence percentage", () => {
    expect(criterionPredictionChipLabel(prediction({ value: 2, confidence: 0.86 }))).toBe("ИИ: 2 · 86%");
  });

  it("renders a pass verdict for pass/fail criteria", () => {
    expect(criterionPredictionChipLabel(prediction({ passed: true, value: undefined, confidence: 0.9 }))).toBe(
      "ИИ: зачёт · 90%"
    );
  });

  it("renders a fail verdict for pass/fail criteria", () => {
    expect(criterionPredictionChipLabel(prediction({ passed: false, value: undefined, confidence: 0.5 }))).toBe(
      "ИИ: незачёт · 50%"
    );
  });

  it("renders a not-applicable verdict when the model marks the criterion N/A", () => {
    expect(
      criterionPredictionChipLabel(prediction({ isNotApplicable: true, value: undefined, confidence: 0.4 }))
    ).toBe("ИИ: Н/П · 40%");
  });

  it("rounds the confidence to the nearest whole percent", () => {
    expect(criterionPredictionChipLabel(prediction({ value: 3, confidence: 0.835 }))).toBe("ИИ: 3 · 84%");
  });
});
