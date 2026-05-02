export type CriterionInput = {
  id: string;
  label: string;
  type: "SCALE_1_3" | "PASS_FAIL";
  weight: number;
  score?: number;
  passed?: boolean;
  notApplicable?: boolean;
};

export type ScoreResult = {
  score: number;
  maxWeight: number;
};

export function calculateReviewScore(criteria: CriterionInput[]): ScoreResult {
  const applicableCriteria = criteria.filter(
    (criterion) => !criterion.notApplicable
  );

  const maxWeight = applicableCriteria.reduce(
    (total, criterion) => total + criterion.weight,
    0
  );

  if (maxWeight === 0) {
    return { score: 0, maxWeight: 0 };
  }

  const earnedWeight = applicableCriteria.reduce((total, criterion) => {
    if (criterion.type === "SCALE_1_3") {
      if (criterion.score === undefined) {
        throw new Error(`Missing scale score for ${criterion.id}`);
      }

      if (
        !Number.isInteger(criterion.score) ||
        criterion.score < 1 ||
        criterion.score > 3
      ) {
        throw new Error(`Scale score for ${criterion.id} must be between 1 and 3`);
      }

      return total + criterion.weight * (criterion.score / 3);
    }

    if (criterion.passed === undefined) {
      throw new Error(`Missing pass/fail score for ${criterion.id}`);
    }

    if (typeof criterion.passed !== "boolean") {
      throw new Error(`Pass/fail score for ${criterion.id} must be boolean`);
    }

    return total + (criterion.passed ? criterion.weight : 0);
  }, 0);

  return {
    score: roundToTwoDecimals((earnedWeight / maxWeight) * 100),
    maxWeight
  };
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}
