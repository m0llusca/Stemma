import type { CriterionKind, Prisma } from "@prisma/client";
import { auditLog } from "@/lib/audit";
import {
  parseConversationScorePrediction,
  type ConversationScorePrediction,
  type CriterionPrediction
} from "@/lib/ai-quality/scoring/types";
import { findLatestReopenedAt, recordReviewEvent } from "@/lib/review-events";
import { calculateReviewScore } from "@/lib/score";

/**
 * Materializes an approved/changed AI "score" draft into a human-owned DRAFT
 * Review + CriterionScore rows — closing the competitive silo vs Zendesk QA /
 * Klaus AutoQA where accept writes scores the human still must finalize.
 *
 * Deferred (not in this pass):
 * - Auto-finalize after approve (human confirm remains required).
 * - Non-score draft kinds (risk_tag / coaching / …) → Review findings.
 * - Writing into another reviewer's draft (scope is the deciding actor's HUMAN draft).
 * - Full scorecard rematerialization when criterion IDs were rotated without key continuity.
 */

export type ScorecardCriterionForMapping = {
  id: string;
  key: string;
  kind: CriterionKind;
  label: string;
  weight: number;
};

export type MappedCriterionScore = {
  criterionId: string;
  value: number | null;
  passed: boolean | null;
  isNotApplicable: boolean;
  comment: string;
  evidenceMessageId: string | null;
};

export type MapScorePredictionResult = {
  scores: MappedCriterionScore[];
  mappedCriterionIds: string[];
  unmappedPredictionIds: string[];
  unmatchedScorecardIds: string[];
};

function predictionForCriterion(
  criterion: ScorecardCriterionForMapping,
  byId: Map<string, CriterionPrediction>,
  byKey: Map<string, CriterionPrediction>
): CriterionPrediction | null {
  return byId.get(criterion.id) ?? byKey.get(criterion.key) ?? null;
}

function mapOneCriterion(
  criterion: ScorecardCriterionForMapping,
  prediction: CriterionPrediction,
  validMessageIds: Set<string>
): MappedCriterionScore | null {
  const evidenceMessageId =
    prediction.evidenceRef && validMessageIds.has(prediction.evidenceRef) ? prediction.evidenceRef : null;
  const comment = prediction.rationale?.trim() ? prediction.rationale.trim() : "";

  if (prediction.isNotApplicable) {
    return {
      criterionId: criterion.id,
      value: null,
      passed: null,
      isNotApplicable: true,
      comment,
      evidenceMessageId
    };
  }

  if (criterion.kind === "SCALE_1_3") {
    if (typeof prediction.value !== "number" || !Number.isInteger(prediction.value) || prediction.value < 1 || prediction.value > 3) {
      return null;
    }
    return {
      criterionId: criterion.id,
      value: prediction.value,
      passed: null,
      isNotApplicable: false,
      comment,
      evidenceMessageId
    };
  }

  if (typeof prediction.passed !== "boolean") {
    return null;
  }

  return {
    criterionId: criterion.id,
    value: null,
    passed: prediction.passed,
    isNotApplicable: false,
    comment,
    evidenceMessageId
  };
}

/**
 * Best-effort map of an AI score prediction onto the active scorecard.
 * Aligns primarily by criterionId, with criterionKey as a fallback when IDs drifted.
 * Unmatched scorecard criteria become N/A so draft totalScore stays computable;
 * callers must fail closed when zero criteria mapped.
 */
export function mapScorePredictionToCriterionScores(input: {
  prediction: ConversationScorePrediction;
  scorecardCriteria: ScorecardCriterionForMapping[];
  validMessageIds: Set<string>;
}): MapScorePredictionResult {
  const byId = new Map<string, CriterionPrediction>();
  const byKey = new Map<string, CriterionPrediction>();

  for (const entry of input.prediction.criteria) {
    if (entry.criterionId) {
      byId.set(entry.criterionId, entry);
    }
    if (entry.criterionKey) {
      byKey.set(entry.criterionKey, entry);
    }
  }

  const scores: MappedCriterionScore[] = [];
  const mappedCriterionIds: string[] = [];
  const unmatchedScorecardIds: string[] = [];
  const consumedPredictions = new Set<CriterionPrediction>();

  for (const criterion of input.scorecardCriteria) {
    const prediction = predictionForCriterion(criterion, byId, byKey);
    if (!prediction) {
      unmatchedScorecardIds.push(criterion.id);
      scores.push({
        criterionId: criterion.id,
        value: null,
        passed: null,
        isNotApplicable: true,
        comment: "",
        evidenceMessageId: null
      });
      continue;
    }

    consumedPredictions.add(prediction);
    const mapped = mapOneCriterion(criterion, prediction, input.validMessageIds);
    if (!mapped) {
      unmatchedScorecardIds.push(criterion.id);
      scores.push({
        criterionId: criterion.id,
        value: null,
        passed: null,
        isNotApplicable: true,
        comment: prediction.rationale?.trim() ? prediction.rationale.trim() : "",
        evidenceMessageId: null
      });
      continue;
    }

    mappedCriterionIds.push(criterion.id);
    scores.push(mapped);
  }

  const unmappedPredictionIds = input.prediction.criteria
    .filter((entry) => !consumedPredictions.has(entry))
    .map((entry) => entry.criterionId || entry.criterionKey)
    .filter(Boolean);

  return { scores, mappedCriterionIds, unmatchedScorecardIds, unmappedPredictionIds };
}

export type ApplyApprovedScoreDraftInput = {
  workspaceId: string;
  actorId: string;
  draft: {
    id: string;
    kind: string;
    conversationId: string | null;
    reviewId: string | null;
    suggestedValueJson: string;
  };
  decision: "approved" | "changed";
};

export type ApplyApprovedScoreDraftResult = {
  applied: boolean;
  reviewId: string | null;
  mappedCount: number;
  skippedReason?: string;
};

type ApplyTx = Prisma.TransactionClient;

async function loadActiveScorecard(tx: ApplyTx, workspaceId: string) {
  return tx.scorecard.findFirst({
    where: { workspaceId, isActive: true },
    orderBy: [{ version: "desc" }],
    select: {
      id: true,
      version: true,
      criteria: {
        orderBy: [{ order: "asc" }],
        select: { id: true, key: true, kind: true, label: true, weight: true }
      }
    }
  });
}

/**
 * Writes CriterionScores from an approved/changed "score" draft onto a DRAFT
 * Review owned by the deciding human. Idempotent when the draft already points
 * at a DRAFT review whose scores match the mapped payload (no-op rewrite still
 * audited once per decision because decideAiQualityDraft is one-shot).
 */
export async function applyApprovedScoreDraft(
  tx: ApplyTx,
  input: ApplyApprovedScoreDraftInput
): Promise<ApplyApprovedScoreDraftResult> {
  if (input.draft.kind !== "score") {
    return { applied: false, reviewId: input.draft.reviewId, mappedCount: 0, skippedReason: "not_score_kind" };
  }

  if (!input.draft.conversationId) {
    throw new Error("Нельзя применить AI-оценку без привязки к обращению.");
  }

  const prediction = parseConversationScorePrediction(input.draft.suggestedValueJson);
  if (!prediction) {
    throw new Error("Не удалось разобрать payload AI-оценки для записи в проверку.");
  }

  const scorecard = await loadActiveScorecard(tx, input.workspaceId);
  if (!scorecard || scorecard.criteria.length === 0) {
    throw new Error("Нет активной оценочной карты для записи AI-оценки.");
  }

  const messages = await tx.message.findMany({
    where: { conversationId: input.draft.conversationId, isPrivate: false },
    select: { id: true }
  });
  const validMessageIds = new Set(messages.map((message) => message.id));

  const mapped = mapScorePredictionToCriterionScores({
    prediction,
    scorecardCriteria: scorecard.criteria,
    validMessageIds
  });

  if (mapped.mappedCriterionIds.length === 0) {
    throw new Error(
      "AI-оценка не совпала с критериями активной оценочной карты (схема criteria id/key). Запись в проверку отложена — исправьте payload или scorecard."
    );
  }

  const { totalScore } = calculateReviewScore(
    scorecard.criteria.map((criterion) => {
      const score = mapped.scores.find((entry) => entry.criterionId === criterion.id)!;
      return {
        id: criterion.id,
        label: criterion.label,
        type: criterion.kind,
        weight: criterion.weight,
        score: score.isNotApplicable || score.value == null ? undefined : score.value,
        passed: score.isNotApplicable || score.passed == null ? undefined : score.passed,
        notApplicable: score.isNotApplicable
      };
    })
  );

  const conversation = await tx.conversation.findFirst({
    where: { id: input.draft.conversationId, workspaceId: input.workspaceId },
    select: { id: true, qaStatus: true, qaAssigneeId: true, qaAssigneeName: true }
  });

  if (!conversation) {
    throw new Error("Обращение для AI-оценки не найдено в рабочем пространстве.");
  }

  if (conversation.qaStatus === "FINALIZED") {
    throw new Error("Нельзя записать AI-оценку в завершённый цикл проверки — сначала переоткройте обращение.");
  }

  const latestReopenedAt = await findLatestReopenedAt(tx, input.workspaceId, conversation.id);

  let existingReview =
    input.draft.reviewId != null
      ? await tx.review.findFirst({
          where: {
            id: input.draft.reviewId,
            workspaceId: input.workspaceId,
            conversationId: conversation.id
          },
          select: {
            id: true,
            status: true,
            reviewerId: true,
            reviewSource: true,
            totalScore: true,
            scores: {
              select: { criterionId: true, value: true, passed: true, isNotApplicable: true }
            }
          }
        })
      : null;

  if (!existingReview) {
    const where: Prisma.ReviewWhereInput = {
      workspaceId: input.workspaceId,
      conversationId: conversation.id,
      reviewerId: input.actorId,
      reviewSource: "HUMAN"
    };
    if (latestReopenedAt) {
      where.OR = [{ createdAt: { gt: latestReopenedAt } }, { finalizedAt: { gt: latestReopenedAt } }];
    }
    existingReview = await tx.review.findFirst({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        reviewerId: true,
        reviewSource: true,
        totalScore: true,
        scores: {
          select: { criterionId: true, value: true, passed: true, isNotApplicable: true }
        }
      }
    });
  }

  if (existingReview?.status === "FINALIZED") {
    throw new Error("Уже есть завершённая проверка — AI-оценку нельзя перезаписать без пересмотра.");
  }

  if (existingReview && (existingReview.reviewerId !== input.actorId || existingReview.reviewSource !== "HUMAN")) {
    throw new Error("AI-оценка привязана к чужой проверке — запись отклонена.");
  }

  const previousScores = existingReview?.scores ?? [];
  const scoresIdentical =
    existingReview != null &&
    previousScores.length === mapped.scores.length &&
    mapped.scores.every((next) => {
      const prev = previousScores.find((row) => row.criterionId === next.criterionId);
      return (
        prev != null &&
        prev.value === next.value &&
        prev.passed === next.passed &&
        prev.isNotApplicable === next.isNotApplicable
      );
    });

  let reviewId: string;

  if (existingReview && scoresIdentical) {
    reviewId = existingReview.id;
  } else if (existingReview) {
    await tx.criterionScore.deleteMany({ where: { reviewId: existingReview.id } });
    const updated = await tx.review.update({
      where: { id: existingReview.id },
      data: {
        scorecardId: scorecard.id,
        rubricVersion: scorecard.version,
        status: "DRAFT",
        totalScore,
        confidence: prediction.overallConfidence,
        summary: prediction.summary,
        scores: { create: mapped.scores },
        finalizedAt: null
      },
      select: { id: true }
    });
    reviewId = updated.id;
  } else {
    const created = await tx.review.create({
      data: {
        workspaceId: input.workspaceId,
        conversationId: conversation.id,
        reviewerId: input.actorId,
        scorecardId: scorecard.id,
        reviewSource: "HUMAN",
        rubricVersion: scorecard.version,
        status: "DRAFT",
        totalScore,
        confidence: prediction.overallConfidence,
        summary: prediction.summary,
        scores: { create: mapped.scores }
      },
      select: { id: true }
    });
    reviewId = created.id;
  }

  if (input.draft.reviewId !== reviewId) {
    await tx.aiQualityDraft.update({
      where: { id: input.draft.id },
      data: { reviewId }
    });
  }

  if (conversation.qaStatus === "QUEUED" || conversation.qaStatus === "ASSIGNED" || conversation.qaStatus === "REOPENED") {
    const actor =
      conversation.qaAssigneeName == null
        ? await tx.user.findFirst({
            where: { id: input.actorId, workspaceId: input.workspaceId },
            select: { name: true }
          })
        : null;

    await tx.conversation.updateMany({
      where: {
        id: conversation.id,
        workspaceId: input.workspaceId,
        qaStatus: conversation.qaStatus
      },
      data: {
        qaStatus: "IN_PROGRESS",
        qaAssigneeId: conversation.qaAssigneeId ?? input.actorId,
        qaAssigneeName: conversation.qaAssigneeName ?? actor?.name ?? "QA"
      }
    });
  }

  await auditLog(
    {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: "ai_quality.draft.scores_applied",
      targetType: "review",
      targetId: reviewId,
      metadata: {
        draftId: input.draft.id,
        decision: input.decision,
        conversationId: conversation.id,
        scorecardId: scorecard.id,
        totalScore,
        previousTotalScore: existingReview?.totalScore ?? null,
        previousScores,
        mappedCriterionIds: mapped.mappedCriterionIds,
        unmatchedScorecardIds: mapped.unmatchedScorecardIds,
        unmappedPredictionIds: mapped.unmappedPredictionIds,
        scoresIdentical,
        scores: mapped.scores.map((entry) => ({
          criterionId: entry.criterionId,
          value: entry.value,
          passed: entry.passed,
          isNotApplicable: entry.isNotApplicable
        }))
      }
    },
    tx
  );

  if (!scoresIdentical) {
    await recordReviewEvent(tx, {
      workspaceId: input.workspaceId,
      reviewId,
      conversationId: conversation.id,
      actorId: input.actorId,
      action: "review.draft_saved",
      fromStatus: existingReview?.status ?? null,
      toStatus: "DRAFT",
      metadata: {
        source: "ai_quality_draft",
        draftId: input.draft.id,
        decision: input.decision,
        totalScore,
        previousTotalScore: existingReview?.totalScore ?? null
      }
    });
  }

  return {
    applied: true,
    reviewId,
    mappedCount: mapped.mappedCriterionIds.length,
    ...(scoresIdentical ? { skippedReason: "already_applied" } : {})
  };
}
