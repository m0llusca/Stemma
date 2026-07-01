/**
 * Per-criterion calibration agreement engine. Calibration participants score the
 * same items as Review(reviewSource="CALIBRATION") with per-criterion scores.
 * This turns those parallel per-criterion answers into a measurable consensus
 * signal per criterion (how often participants land on the same answer, how wide
 * a scale criterion is spread, and whether the group's modal answer matches the
 * baseline/reference review). Pure and dependency-free so it is trivially
 * testable and reusable across the calibration board and analytics.
 */
export type CalibrationCriterionKind = "SCALE_1_3" | "PASS_FAIL";

export type CalibrationCriterionScore = {
  criterionId: string;
  value: number | null;
  passed: boolean | null;
  isNotApplicable: boolean;
};

export type CalibrationCriterionAgreement = {
  criterionId: string;
  participantCount: number;
  agreementRate: number | null;
  scaleSpread: number | null;
  matchesBaseline: boolean | null;
};

export type CalibrationItemAgreement = {
  criteria: CalibrationCriterionAgreement[];
  overallAgreementRate: number | null;
  misalignedCriteria: number;
};

// Sentinel encoding an "N/A" answer so it can be compared like any other value.
const NA_ANSWER = "NA";

const MISALIGNED_THRESHOLD = 0.75;

/**
 * Reduces a single per-criterion score row to a comparable answer:
 *   - the sentinel "NA" when marked not applicable,
 *   - the numeric value for SCALE_1_3,
 *   - the boolean for PASS_FAIL,
 * or null when the participant has no usable answer for that criterion.
 */
function answerFor(score: CalibrationCriterionScore, kind: CalibrationCriterionKind): string | number | boolean | null {
  if (score.isNotApplicable) {
    return NA_ANSWER;
  }

  if (kind === "SCALE_1_3") {
    return score.value != null ? score.value : null;
  }

  return score.passed != null ? score.passed : null;
}

export function computeCalibrationItemAgreement(input: {
  criteria: Array<{ id: string; kind: CalibrationCriterionKind }>;
  participants: Array<{ scores: CalibrationCriterionScore[] }>;
  baseline?: { scores: CalibrationCriterionScore[] } | null;
}): CalibrationItemAgreement {
  const baselineById = new Map((input.baseline?.scores ?? []).map((score) => [score.criterionId, score]));

  const criteria: CalibrationCriterionAgreement[] = [];
  let rateSum = 0;
  let rateCount = 0;
  let misalignedCriteria = 0;

  for (const criterion of input.criteria) {
    const answers: Array<string | number | boolean> = [];
    const numericAnswers: number[] = [];

    for (const participant of input.participants) {
      const score = participant.scores.find((entry) => entry.criterionId === criterion.id);
      if (!score) {
        continue; // Participant did not score this criterion — skip them.
      }

      const answer = answerFor(score, criterion.kind);
      if (answer == null) {
        continue;
      }

      answers.push(answer);
      if (criterion.kind === "SCALE_1_3" && typeof answer === "number") {
        numericAnswers.push(answer);
      }
    }

    const participantCount = answers.length;

    // Tally each distinct answer to find the modal (most common) one.
    const counts = new Map<string | number | boolean, number>();
    for (const answer of answers) {
      counts.set(answer, (counts.get(answer) ?? 0) + 1);
    }
    let modalAnswer: string | number | boolean | null = null;
    let modalCount = 0;
    for (const [answer, count] of counts) {
      if (count > modalCount) {
        modalAnswer = answer;
        modalCount = count;
      }
    }

    const agreementRate = participantCount >= 2 ? modalCount / participantCount : null;
    const scaleSpread =
      criterion.kind === "SCALE_1_3" && numericAnswers.length >= 2
        ? Math.max(...numericAnswers) - Math.min(...numericAnswers)
        : null;

    let matchesBaseline: boolean | null = null;
    if (agreementRate != null && modalAnswer != null) {
      const baselineScore = baselineById.get(criterion.id);
      if (baselineScore) {
        const baselineAnswer = answerFor(baselineScore, criterion.kind);
        if (baselineAnswer != null) {
          matchesBaseline = baselineAnswer === modalAnswer;
        }
      }
    }

    if (agreementRate != null) {
      rateSum += agreementRate;
      rateCount += 1;
      if (agreementRate < MISALIGNED_THRESHOLD) {
        misalignedCriteria += 1;
      }
    }

    criteria.push({
      criterionId: criterion.id,
      participantCount,
      agreementRate,
      scaleSpread,
      matchesBaseline
    });
  }

  return {
    criteria,
    overallAgreementRate: rateCount > 0 ? rateSum / rateCount : null,
    misalignedCriteria
  };
}
