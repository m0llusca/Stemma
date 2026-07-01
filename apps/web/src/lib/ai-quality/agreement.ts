/**
 * AI↔human agreement engine. Compares a finalized human review's per-criterion
 * scores against the AI draft's per-criterion predictions for the same
 * conversation — turning the paired data the app already stores into a
 * measurable agreement signal (per criterion and aggregate). Pure and
 * dependency-free so it is trivially testable and reusable across the review
 * workbench and analytics.
 */
export type AgreementCriterionKind = "SCALE_1_3" | "PASS_FAIL";

export type HumanCriterionScore = {
  criterionId: string;
  value: number | null;
  passed: boolean | null;
  isNotApplicable: boolean;
};

export type AiCriterionPrediction = {
  criterionId: string;
  value?: number | null;
  passed?: boolean | null;
  isNotApplicable?: boolean;
  confidence?: number | null;
};

export type CriterionAgreement = {
  criterionId: string;
  kind: AgreementCriterionKind;
  comparable: boolean;
  agree: boolean | null;
  humanValue: number | null;
  humanPassed: boolean | null;
  aiValue: number | null;
  aiPassed: boolean | null;
  scaleDelta: number | null;
  aiConfidence: number | null;
};

export type AiHumanAgreement = {
  comparedCount: number;
  agreeCount: number;
  agreementRate: number | null;
  meanScaleDelta: number | null;
  criteria: CriterionAgreement[];
};

export function computeAiHumanAgreement(input: {
  criteria: Array<{ id: string; kind: AgreementCriterionKind }>;
  human: HumanCriterionScore[];
  ai: AiCriterionPrediction[];
}): AiHumanAgreement {
  const humanById = new Map(input.human.map((entry) => [entry.criterionId, entry]));
  const aiById = new Map(input.ai.map((entry) => [entry.criterionId, entry]));

  const criteria: CriterionAgreement[] = [];
  let agreeCount = 0;
  let comparedCount = 0;
  let scaleDeltaSum = 0;
  let scaleDeltaCount = 0;

  for (const criterion of input.criteria) {
    const human = humanById.get(criterion.id);
    const ai = aiById.get(criterion.id);

    const humanValue = human && human.value != null ? human.value : null;
    const humanPassed = human && human.passed != null ? human.passed : null;
    const aiValue = ai && ai.value != null ? ai.value : null;
    const aiPassed = ai && ai.passed != null ? ai.passed : null;
    const aiConfidence = ai && ai.confidence != null ? ai.confidence : null;
    const humanNa = Boolean(human?.isNotApplicable);
    const aiNa = Boolean(ai?.isNotApplicable);

    // A criterion is only comparable when BOTH sides scored it (an N/A counts as a
    // scored answer; a missing human review or missing AI prediction does not).
    const humanScored = Boolean(human) && (humanNa || humanValue != null || humanPassed != null);
    const aiScored = Boolean(ai) && (aiNa || aiValue != null || aiPassed != null);

    let comparable = false;
    let agree: boolean | null = null;
    let scaleDelta: number | null = null;

    if (humanScored && aiScored) {
      comparable = true;
      comparedCount += 1;

      if (humanNa || aiNa) {
        agree = humanNa === aiNa;
      } else if (criterion.kind === "SCALE_1_3") {
        if (humanValue != null && aiValue != null) {
          scaleDelta = Math.abs(humanValue - aiValue);
          agree = scaleDelta === 0;
          scaleDeltaSum += scaleDelta;
          scaleDeltaCount += 1;
        } else {
          agree = false;
        }
      } else if (humanPassed != null && aiPassed != null) {
        agree = humanPassed === aiPassed;
      } else {
        agree = false;
      }

      if (agree) {
        agreeCount += 1;
      }
    }

    criteria.push({
      criterionId: criterion.id,
      kind: criterion.kind,
      comparable,
      agree,
      humanValue,
      humanPassed,
      aiValue,
      aiPassed,
      scaleDelta,
      aiConfidence
    });
  }

  return {
    comparedCount,
    agreeCount,
    agreementRate: comparedCount > 0 ? agreeCount / comparedCount : null,
    meanScaleDelta: scaleDeltaCount > 0 ? scaleDeltaSum / scaleDeltaCount : null,
    criteria
  };
}

export type CriterionAgreementAggregate = {
  criterionId: string;
  comparedCount: number;
  agreeCount: number;
  agreementRate: number | null;
  meanScaleDelta: number | null;
};

export type AiHumanAgreementAggregate = {
  conversationsCompared: number;
  comparedCount: number;
  agreeCount: number;
  agreementRate: number | null;
  meanScaleDelta: number | null;
  byCriterion: CriterionAgreementAggregate[];
};

type CriterionAccumulator = {
  comparedCount: number;
  agreeCount: number;
  scaleDeltaSum: number;
  scaleDeltaCount: number;
};

/**
 * Rolls up per-conversation agreements into an overall + per-criterion aggregate,
 * so analytics can answer "which criteria do AI and humans diverge on most" with
 * real sample sizes.
 */
export function aggregateAiHumanAgreement(perConversation: AiHumanAgreement[]): AiHumanAgreementAggregate {
  const byCriterion = new Map<string, CriterionAccumulator>();
  let conversationsCompared = 0;
  let comparedCount = 0;
  let agreeCount = 0;
  let scaleDeltaSum = 0;
  let scaleDeltaCount = 0;

  for (const conversation of perConversation) {
    if (conversation.comparedCount > 0) {
      conversationsCompared += 1;
    }

    for (const criterion of conversation.criteria) {
      if (!criterion.comparable) {
        continue;
      }

      comparedCount += 1;
      if (criterion.agree) {
        agreeCount += 1;
      }
      if (criterion.scaleDelta != null) {
        scaleDeltaSum += criterion.scaleDelta;
        scaleDeltaCount += 1;
      }

      const bucket = byCriterion.get(criterion.criterionId) ?? {
        comparedCount: 0,
        agreeCount: 0,
        scaleDeltaSum: 0,
        scaleDeltaCount: 0
      };
      bucket.comparedCount += 1;
      if (criterion.agree) {
        bucket.agreeCount += 1;
      }
      if (criterion.scaleDelta != null) {
        bucket.scaleDeltaSum += criterion.scaleDelta;
        bucket.scaleDeltaCount += 1;
      }
      byCriterion.set(criterion.criterionId, bucket);
    }
  }

  const perCriterion: CriterionAgreementAggregate[] = Array.from(byCriterion.entries()).map(([criterionId, bucket]) => ({
    criterionId,
    comparedCount: bucket.comparedCount,
    agreeCount: bucket.agreeCount,
    agreementRate: bucket.comparedCount > 0 ? bucket.agreeCount / bucket.comparedCount : null,
    meanScaleDelta: bucket.scaleDeltaCount > 0 ? bucket.scaleDeltaSum / bucket.scaleDeltaCount : null
  }));

  return {
    conversationsCompared,
    comparedCount,
    agreeCount,
    agreementRate: comparedCount > 0 ? agreeCount / comparedCount : null,
    meanScaleDelta: scaleDeltaCount > 0 ? scaleDeltaSum / scaleDeltaCount : null,
    byCriterion: perCriterion
  };
}
