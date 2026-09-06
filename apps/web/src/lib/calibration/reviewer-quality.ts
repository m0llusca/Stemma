/**
 * GraderQA-lite helpers: surface low inter-rater agreement on CALIBRATION
 * reviews of the same conversation, plus optional HUMAN finalize volume per
 * QA analyst. Pure so the calibration page and tests share one reduction.
 */
import {
  computeCalibrationItemAgreement,
  type CalibrationCriterionKind,
  type CalibrationCriterionScore
} from "@/lib/calibration/agreement";

export const LOW_AGREEMENT_RATE_THRESHOLD = 0.75;
export const LOW_AGREEMENT_SCORE_SPREAD_THRESHOLD = 10;

export type ReviewerQualityCalibrationItemInput = {
  sessionId: string;
  sessionName: string;
  conversationId: string;
  conversationSubject: string;
  conversationExternalId: string;
  criteria: Array<{ id: string; kind: CalibrationCriterionKind }>;
  participants: Array<{ scores: CalibrationCriterionScore[] }>;
  /** Rounded total scores from finalized CALIBRATION reviews (same conversation). */
  totalScores: number[];
};

export type LowAgreementCalibrationRow = {
  sessionId: string;
  sessionName: string;
  conversationId: string;
  conversationSubject: string;
  conversationExternalId: string;
  participantCount: number;
  overallAgreementRate: number | null;
  scoreSpread: number | null;
  misalignedCriteria: number;
};

export type ReviewerVolumeRow = {
  reviewerId: string;
  reviewerName: string;
  count: number;
};

function scoreSpread(scores: number[]) {
  if (scores.length < 2) {
    return null;
  }

  return Math.max(...scores) - Math.min(...scores);
}

/**
 * Lists calibration conversation pairs with weak consensus: either criterion
 * agreement below threshold or total-score spread above ±threshold. Sorted
 * worst agreement first, then widest spread.
 */
export function listLowAgreementCalibrationItems(
  items: readonly ReviewerQualityCalibrationItemInput[],
  options?: {
    agreementThreshold?: number;
    scoreSpreadThreshold?: number;
    limit?: number;
  }
): LowAgreementCalibrationRow[] {
  const agreementThreshold = options?.agreementThreshold ?? LOW_AGREEMENT_RATE_THRESHOLD;
  const scoreSpreadThreshold = options?.scoreSpreadThreshold ?? LOW_AGREEMENT_SCORE_SPREAD_THRESHOLD;
  const limit = options?.limit ?? 12;

  const rows: LowAgreementCalibrationRow[] = [];

  for (const item of items) {
    if (item.participants.length < 2) {
      continue;
    }

    const agreement = computeCalibrationItemAgreement({
      criteria: item.criteria,
      participants: item.participants
    });
    const spread = scoreSpread(item.totalScores.map((score) => Math.round(score)));
    const lowAgreement =
      (agreement.overallAgreementRate != null && agreement.overallAgreementRate < agreementThreshold) ||
      (spread != null && spread > scoreSpreadThreshold);

    if (!lowAgreement) {
      continue;
    }

    rows.push({
      sessionId: item.sessionId,
      sessionName: item.sessionName,
      conversationId: item.conversationId,
      conversationSubject: item.conversationSubject,
      conversationExternalId: item.conversationExternalId,
      participantCount: item.participants.length,
      overallAgreementRate: agreement.overallAgreementRate,
      scoreSpread: spread,
      misalignedCriteria: agreement.misalignedCriteria
    });
  }

  return rows
    .sort((left, right) => {
      const leftRate = left.overallAgreementRate ?? 1;
      const rightRate = right.overallAgreementRate ?? 1;
      if (leftRate !== rightRate) {
        return leftRate - rightRate;
      }

      const leftSpread = left.scoreSpread ?? 0;
      const rightSpread = right.scoreSpread ?? 0;
      if (leftSpread !== rightSpread) {
        return rightSpread - leftSpread;
      }

      return left.conversationExternalId.localeCompare(right.conversationExternalId, "ru");
    })
    .slice(0, limit);
}

/** Counts HUMAN finalized reviews per QA analyst (volume, not blind regrade). */
export function aggregateReviewerVolume(
  reviews: readonly { reviewerId: string; reviewerName: string }[],
  limit = 10
): ReviewerVolumeRow[] {
  const counts = new Map<string, ReviewerVolumeRow>();

  for (const review of reviews) {
    const current = counts.get(review.reviewerId) ?? {
      reviewerId: review.reviewerId,
      reviewerName: review.reviewerName,
      count: 0
    };
    current.count += 1;
    counts.set(review.reviewerId, current);
  }

  return Array.from(counts.values())
    .sort(
      (left, right) =>
        right.count - left.count || left.reviewerName.localeCompare(right.reviewerName, "ru")
    )
    .slice(0, limit);
}
