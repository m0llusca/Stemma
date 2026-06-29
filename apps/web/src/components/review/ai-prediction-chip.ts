import type { CriterionPrediction } from "@/lib/ai-quality/scoring/types";

/**
 * Maps a real per-criterion model prediction to the short label shown in the
 * violet AI provenance chip, e.g. "ИИ: 2 · 86%" for a SCALE_1_3 verdict or
 * "ИИ: зачёт · 90%" for a PASS_FAIL one. The percentage is the per-criterion
 * confidence rounded to a whole number; the verdict mirrors the model's call
 * (a numeric grade, pass/fail, or "Н/П" when the criterion does not apply).
 */
export function criterionPredictionChipLabel(prediction: CriterionPrediction): string {
  const confidencePercent = Math.round(clampUnit(prediction.confidence) * 100);
  return `ИИ: ${verdict(prediction)} · ${confidencePercent}%`;
}

function verdict(prediction: CriterionPrediction): string {
  if (prediction.isNotApplicable) {
    return "Н/П";
  }

  if (typeof prediction.passed === "boolean") {
    return prediction.passed ? "зачёт" : "незачёт";
  }

  if (typeof prediction.value === "number") {
    return String(prediction.value);
  }

  return "—";
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}
