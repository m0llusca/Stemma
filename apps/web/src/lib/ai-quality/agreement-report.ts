import {
  aggregateAiHumanAgreement,
  computeAiHumanAgreement,
  type AgreementCriterionKind,
  type AiCriterionPrediction,
  type AiHumanAgreementAggregate
} from "@/lib/ai-quality/agreement";
import { isDeterministicAiModel } from "@/lib/ai-quality/draft-origin";
import { prisma } from "@/lib/db";

/**
 * Workspace-level AI↔human agreement analytics: for each finalized human review,
 * compare its per-criterion scores against the latest *real* AI score draft for
 * the same conversation (deterministic-fallback drafts are excluded — comparing
 * against a heuristic placeholder is not "AI agreement"), then aggregate to show
 * which criteria AI and humans diverge on most.
 */
export type AiHumanAgreementCriterionRow = {
  criterionId: string;
  key: string;
  label: string;
  block: string;
  kind: AgreementCriterionKind;
  comparedCount: number;
  agreeCount: number;
  agreementRate: number | null;
  meanScaleDelta: number | null;
};

export type AiHumanAgreementReport = {
  aggregate: AiHumanAgreementAggregate;
  criteria: AiHumanAgreementCriterionRow[];
  reviewsConsidered: number;
  aiComparedConversations: number;
};

function parseAiCriteria(json: string): AiCriterionPrediction[] {
  try {
    const parsed = JSON.parse(json);
    const criteria = parsed && typeof parsed === "object" ? (parsed as { criteria?: unknown }).criteria : null;
    if (!Array.isArray(criteria)) {
      return [];
    }
    const out: AiCriterionPrediction[] = [];
    for (const item of criteria) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const record = item as Record<string, unknown>;
      const criterionId = typeof record.criterionId === "string" ? record.criterionId : "";
      if (!criterionId) {
        continue;
      }
      out.push({
        criterionId,
        value: typeof record.value === "number" ? record.value : null,
        passed: typeof record.passed === "boolean" ? record.passed : null,
        isNotApplicable: record.isNotApplicable === true,
        confidence: typeof record.confidence === "number" ? record.confidence : null
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function loadAiHumanAgreementReport(
  workspaceId: string,
  options: { since?: Date; until?: Date; limit?: number } = {}
): Promise<AiHumanAgreementReport | null> {
  const scorecard = await prisma.scorecard.findFirst({
    where: { workspaceId, isActive: true },
    orderBy: [{ version: "desc" }],
    select: {
      criteria: {
        orderBy: [{ order: "asc" }],
        select: { id: true, key: true, label: true, block: true, kind: true }
      }
    }
  });
  if (!scorecard || scorecard.criteria.length === 0) {
    return null;
  }

  const criteriaMeta = scorecard.criteria.map((criterion) => ({
    id: criterion.id,
    kind: criterion.kind as AgreementCriterionKind
  }));

  const reviews = await prisma.review.findMany({
    where: {
      workspaceId,
      reviewSource: "HUMAN",
      status: "FINALIZED",
      ...(options.since || options.until
        ? {
            finalizedAt: {
              ...(options.since ? { gte: options.since } : {}),
              ...(options.until ? { lte: options.until } : {})
            }
          }
        : {})
    },
    orderBy: [{ finalizedAt: "desc" }],
    take: options.limit ?? 500,
    select: {
      conversationId: true,
      scores: {
        select: { criterionId: true, value: true, passed: true, isNotApplicable: true }
      }
    }
  });

  const conversationIds = Array.from(new Set(reviews.map((review) => review.conversationId)));
  const drafts = conversationIds.length
    ? await prisma.aiQualityDraft.findMany({
        where: { workspaceId, kind: "score", conversationId: { in: conversationIds } },
        orderBy: [{ createdAt: "desc" }],
        select: { conversationId: true, suggestedValueJson: true, modelVersion: true }
      })
    : [];

  // Keep only the latest real (non-fallback) AI draft per conversation.
  const draftByConversation = new Map<string, string>();
  for (const draft of drafts) {
    if (!draft.conversationId || isDeterministicAiModel(draft.modelVersion)) {
      continue;
    }
    if (!draftByConversation.has(draft.conversationId)) {
      draftByConversation.set(draft.conversationId, draft.suggestedValueJson);
    }
  }

  const perConversation = reviews.map((review) => {
    const draftJson = draftByConversation.get(review.conversationId);
    return computeAiHumanAgreement({
      criteria: criteriaMeta,
      human: review.scores.map((score) => ({
        criterionId: score.criterionId,
        value: score.value ?? null,
        passed: score.passed ?? null,
        isNotApplicable: score.isNotApplicable
      })),
      ai: draftJson ? parseAiCriteria(draftJson) : []
    });
  });

  const aggregate = aggregateAiHumanAgreement(perConversation);
  const metaById = new Map(scorecard.criteria.map((criterion) => [criterion.id, criterion]));

  const criteria: AiHumanAgreementCriterionRow[] = aggregate.byCriterion
    .map((entry) => {
      const meta = metaById.get(entry.criterionId);
      return {
        criterionId: entry.criterionId,
        key: meta?.key ?? entry.criterionId,
        label: meta?.label ?? entry.criterionId,
        block: meta?.block ?? "",
        kind: (meta?.kind as AgreementCriterionKind) ?? "SCALE_1_3",
        comparedCount: entry.comparedCount,
        agreeCount: entry.agreeCount,
        agreementRate: entry.agreementRate,
        meanScaleDelta: entry.meanScaleDelta
      };
    })
    // Most-diverging criteria first — that's the actionable insight.
    .sort((a, b) => (a.agreementRate ?? 1) - (b.agreementRate ?? 1));

  return {
    aggregate,
    criteria,
    reviewsConsidered: reviews.length,
    aiComparedConversations: aggregate.conversationsCompared
  };
}
