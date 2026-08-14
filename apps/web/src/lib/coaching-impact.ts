import type { Prisma } from "@prisma/client";
import { hasAdequateSample } from "@/lib/analytics/significance";

/**
 * "Did coaching help?" metric. Compares an agent's QA score before vs after a
 * coaching event, using finalized human reviews as the signal. Both the pure
 * computation and the narrow Prisma loader live here so the coaching page (C1)
 * can consume a single, testable contract.
 */

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Default lookback/lookahead window, in days, around a coaching pivot. */
export const DEFAULT_COACHING_IMPACT_WINDOW_DAYS = 14;

/**
 * Minimum |delta| (in score points) that counts as a real move. Anything
 * smaller is reported as "flat" so noise does not read as improvement.
 */
export const COACHING_IMPACT_FLAT_THRESHOLD = 1;

export type CoachingImpactTrend = "up" | "down" | "flat" | "insufficient";

export type CoachingImpactReview = {
  totalScore: number;
};

export type CoachingImpactInput = {
  before: CoachingImpactReview[];
  after: CoachingImpactReview[];
};

export type CoachingImpact = {
  beforeAvg: number | null;
  afterAvg: number | null;
  delta: number | null;
  beforeCount: number;
  afterCount: number;
  trend: CoachingImpactTrend;
  /**
   * True only when BOTH the before and after windows carry enough finalized
   * reviews to trust the delta (see {@link hasAdequateSample}). When false the
   * move may be noise from a thin sample and the UI should caveat it.
   */
  sampleAdequate: boolean;
};

export function trainingEffectKpiHint({
  averageDelta,
  positiveCount,
  measuredCount
}: {
  averageDelta: number | null;
  positiveCount: number;
  measuredCount: number;
}) {
  if (measuredCount <= 0 || averageDelta == null) {
    return "Нужны оценки до и после";
  }

  if (averageDelta > 0) {
    return `${positiveCount} из ${measuredCount} разборов дали рост`;
  }

  if (averageDelta < 0) {
    return `Снижение в среднем; рост у ${positiveCount} из ${measuredCount}`;
  }

  return `Без изменения в среднем; рост у ${positiveCount} из ${measuredCount}`;
}

function roundToOneDecimal(value: number): number {
  // `Number()` strips the trailing zero that toFixed would otherwise add and
  // avoids the -0 result that can fall out of rounding negative deltas.
  return Number((Math.round(value * 10) / 10).toFixed(1)) + 0;
}

function average(reviews: CoachingImpactReview[]): number | null {
  if (reviews.length === 0) {
    return null;
  }

  const sum = reviews.reduce((total, review) => total + review.totalScore, 0);
  return roundToOneDecimal(sum / reviews.length);
}

/**
 * Pure before/after comparison. Averages are rounded to one decimal; `delta`
 * is the rounded after-average minus the rounded before-average (so the three
 * numbers always reconcile on screen). The trend is "insufficient" whenever
 * either side has no reviews, "flat" for sub-threshold moves, otherwise "up"
 * or "down".
 */
export function computeCoachingImpact(input: CoachingImpactInput): CoachingImpact {
  const beforeCount = input.before.length;
  const afterCount = input.after.length;
  const beforeAvg = average(input.before);
  const afterAvg = average(input.after);
  // Adequate only when BOTH sides clear the minimum: a delta anchored on a
  // thin window on either end is not a signal worth reading as a real move.
  const sampleAdequate = hasAdequateSample(beforeCount) && hasAdequateSample(afterCount);

  if (beforeAvg === null || afterAvg === null) {
    return {
      beforeAvg,
      afterAvg,
      delta: null,
      beforeCount,
      afterCount,
      trend: "insufficient",
      sampleAdequate
    };
  }

  const delta = roundToOneDecimal(afterAvg - beforeAvg);

  let trend: CoachingImpactTrend;
  if (Math.abs(delta) < COACHING_IMPACT_FLAT_THRESHOLD) {
    trend = "flat";
  } else if (delta > 0) {
    trend = "up";
  } else {
    trend = "down";
  }

  return {
    beforeAvg,
    afterAvg,
    delta,
    beforeCount,
    afterCount,
    trend,
    sampleAdequate
  };
}

/**
 * Minimal slice of the Prisma client the loader needs. Accepting this (rather
 * than importing the singleton) keeps the loader unit-testable with a mock and
 * usable inside a transaction.
 */
export type CoachingImpactClient = Pick<Prisma.TransactionClient, "review">;

export type LoadAssignmentCoachingImpactArgs = {
  workspaceId: string;
  assigneeName: string;
  /** The coaching event time that splits "before" from "after". */
  pivot: Date;
  /** Window radius in days; defaults to {@link DEFAULT_COACHING_IMPACT_WINDOW_DAYS}. */
  windowDays?: number;
};

/**
 * Loads finalized HUMAN reviews for the given operator (matched through the
 * `Conversation.assigneeName` relation) in two windows around `pivot`:
 *   before = [pivot - windowDays, pivot)
 *   after  = [pivot, pivot + windowDays]
 * then runs {@link computeCoachingImpact} over their total scores. The query is
 * kept narrow (selecting only totalScore + finalizedAt) so it stays cheap.
 */
export async function loadAssignmentCoachingImpact(
  args: LoadAssignmentCoachingImpactArgs,
  client: CoachingImpactClient
): Promise<CoachingImpact> {
  const windowDays = args.windowDays ?? DEFAULT_COACHING_IMPACT_WINDOW_DAYS;
  const windowMs = windowDays * ONE_DAY_MS;
  const beforeStart = new Date(args.pivot.getTime() - windowMs);
  const afterEnd = new Date(args.pivot.getTime() + windowMs);

  const baseWhere = {
    workspaceId: args.workspaceId,
    status: "FINALIZED",
    reviewSource: "HUMAN",
    conversation: { assigneeName: args.assigneeName }
  } as const;

  const select = { totalScore: true, finalizedAt: true } as const;

  const [before, after] = await Promise.all([
    client.review.findMany({
      where: { ...baseWhere, finalizedAt: { gte: beforeStart, lt: args.pivot } },
      select
    }),
    client.review.findMany({
      where: { ...baseWhere, finalizedAt: { gte: args.pivot, lte: afterEnd } },
      select
    })
  ]);

  return computeCoachingImpact({
    before: before.map((review) => ({ totalScore: review.totalScore })),
    after: after.map((review) => ({ totalScore: review.totalScore }))
  });
}
