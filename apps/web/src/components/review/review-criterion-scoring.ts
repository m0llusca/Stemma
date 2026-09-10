import type { CriterionScore, ScorecardCriterion } from "@prisma/client";

import type { ChipTone } from "@/components/ui/chip";
import type { CriterionPrediction } from "@/lib/ai-quality/scoring/types";

/** True when the draft has an explicit pass/fail or scale verdict (not N/A, not missing). */
export function isCriterionAnswered(criterion: ScorecardCriterion, score?: CriterionScore) {
  if (!score || score.isNotApplicable) {
    return false;
  }

  if (criterion.kind === "SCALE_1_3") {
    return typeof score.value === "number";
  }

  return typeof score.passed === "boolean";
}

export function isCriterionIssue(criterion: ScorecardCriterion, score?: CriterionScore) {
  if (!score || score.isNotApplicable) {
    return false;
  }

  if (criterion.kind === "SCALE_1_3") {
    return typeof score.value === "number" && score.value < 3;
  }

  return score.passed === false;
}

export function criterionStatus(
  criterion: ScorecardCriterion,
  score: CriterionScore | undefined,
  presentation: "authoring" | "agent"
): { label: string; tone: ChipTone } {
  if (score?.isNotApplicable) {
    return { label: "Не применимо", tone: "neutral" };
  }

  if (criterion.kind === "SCALE_1_3") {
    if (typeof score?.value !== "number") {
      return { label: "Не оценено", tone: "neutral" };
    }

    const value = score.value;

    if (presentation === "agent") {
      if (value <= 1) {
        return { label: "1/3", tone: "warning" };
      }
      if (value === 2) {
        return { label: "2/3", tone: "warning" };
      }
      return { label: "3/3", tone: "success" };
    }

    if (value <= 1) {
      return { label: "1/3 критично", tone: "danger" };
    }

    if (value === 2) {
      return { label: "2/3 доработка", tone: "warning" };
    }

    return { label: "3/3 стандарт", tone: "success" };
  }

  if (typeof score?.passed !== "boolean") {
    return { label: "Не оценено", tone: "neutral" };
  }

  if (presentation === "agent") {
    return score.passed
      ? { label: "зачтено", tone: "success" }
      : { label: "не зачтено", tone: "warning" };
  }

  return score.passed
    ? { label: "Зачет", tone: "success" }
    : { label: "Незачет", tone: "danger" };
}

/**
 * Whether the human draft verdict matches the real AI prediction for this
 * criterion. Used to flip the AI chip to the quiet "ИИ согласен" state and
 * to decide the indigo override border. Returns `false` when either side is
 * unscored/non-applicable so a real disagreement is never hidden.
 */
export function aiAgreesWithDraft(
  criterion: ScorecardCriterion,
  prediction: CriterionPrediction,
  score?: CriterionScore
) {
  if (score?.isNotApplicable || prediction.isNotApplicable) {
    return Boolean(score?.isNotApplicable) && Boolean(prediction.isNotApplicable);
  }

  if (criterion.kind === "SCALE_1_3") {
    if (typeof prediction.value !== "number" || typeof score?.value !== "number") {
      return false;
    }
    return score.value === prediction.value;
  }

  if (typeof prediction.passed !== "boolean" || typeof score?.passed !== "boolean") {
    return false;
  }
  return score.passed === prediction.passed;
}

/**
 * Per-answer contribution of a criterion toward the 100-point final score.
 * Unscored criteria contribute 0 (never treated as auto-pass / full credit).
 */
export function criterionContribution(
  criterion: ScorecardCriterion,
  totalWeight: number,
  score?: CriterionScore
) {
  if (totalWeight <= 0 || score?.isNotApplicable || !isCriterionAnswered(criterion, score)) {
    return 0;
  }

  if (criterion.kind === "SCALE_1_3") {
    const value = score!.value!;
    return (criterion.weight * (value / 3) * 100) / totalWeight;
  }

  return score!.passed ? (criterion.weight * 100) / totalWeight : 0;
}

/** Radio default for pass/fail: only an explicit boolean, never auto-pass. */
export function passFailDefaultValue(score?: CriterionScore): "true" | "false" | undefined {
  if (typeof score?.passed !== "boolean") {
    return undefined;
  }
  return score.passed ? "true" : "false";
}

/** Radio default for scale: only an explicit value, never auto-3. */
export function scaleDefaultValue(score?: CriterionScore): string | undefined {
  if (typeof score?.value !== "number") {
    return undefined;
  }
  return String(score.value);
}
