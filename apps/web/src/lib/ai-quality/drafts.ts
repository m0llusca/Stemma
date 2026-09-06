import { auditLog } from "@/lib/audit";
import { applyApprovedScoreDraft } from "@/lib/ai-quality/apply-score-draft";
import type { AiQualityDraftDecision, AiQualityDraftKind } from "@/lib/ai-quality/types";
import { prisma } from "@/lib/db";

export type CreateAiQualityDraftInput = {
  workspaceId: string;
  conversationId?: string | null;
  reviewId?: string | null;
  kind: AiQualityDraftKind;
  modelVersion: string;
  promptVersion: string;
  suggestedValue: unknown;
  /** 0..1 overall model confidence, persisted to AiQualityDraft.confidence. */
  confidence?: number;
  evidenceRefs?: string[];
};

export type DecideAiQualityDraftInput = {
  draftId: string;
  decision: AiQualityDraftDecision;
  actorId: string;
  reason?: string | null;
  changedValue?: unknown;
  decidedAt?: Date;
  /** Workspace for audit trail of the human decision. */
  workspaceId: string;
};

function jsonText(value: unknown, fallback: unknown) {
  const serialized = JSON.stringify(value ?? fallback);
  return serialized ?? JSON.stringify(fallback);
}

export async function createAiQualityDraft(input: CreateAiQualityDraftInput) {
  return prisma.aiQualityDraft.create({
    data: {
      workspaceId: input.workspaceId,
      conversationId: input.conversationId ?? null,
      reviewId: input.reviewId ?? null,
      kind: input.kind,
      status: "draft",
      modelVersion: input.modelVersion,
      promptVersion: input.promptVersion,
      confidence: input.confidence ?? null,
      suggestedValueJson: jsonText(input.suggestedValue, {}),
      evidenceRefsJson: jsonText(input.evidenceRefs ?? [], []),
      finalizedById: null
    }
  });
}

export async function decideAiQualityDraft(input: DecideAiQualityDraftInput) {
  const actorId = input.actorId.trim();
  if (!actorId) {
    throw new Error("Решение по AI-черновику требует участия человека.");
  }

  if (input.decision === "changed" && !Object.hasOwn(input, "changedValue")) {
    throw new Error("Для изменения AI-черновика нужно передать новое значение.");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.aiQualityDraft.updateMany({
      where: { id: input.draftId, status: "draft" },
      data: {
        status: input.decision,
        finalizedById: actorId,
        finalizedAt: input.decidedAt ?? new Date(),
        decisionReason: input.reason?.trim() ? input.reason.trim() : null,
        ...(Object.hasOwn(input, "changedValue")
          ? { suggestedValueJson: jsonText(input.changedValue, {}) }
          : {})
      }
    });

    if (updated.count !== 1) {
      throw new Error("Предложение ИИ уже решено или не найдено.");
    }

    const draft = await tx.aiQualityDraft.findUniqueOrThrow({
      where: { id: input.draftId }
    });

    await auditLog(
      {
        workspaceId: input.workspaceId,
        actorId,
        action: "ai_quality.draft.decided",
        targetType: "ai_quality_draft",
        targetId: draft.id,
        metadata: {
          decision: input.decision,
          conversationId: draft.conversationId,
          kind: draft.kind,
          reason: input.reason?.trim() ? input.reason.trim() : null
        }
      },
      tx
    );

    // Accept / override materializes CriterionScores into a DRAFT Review.
    // Reject writes no scores. Never auto-finalizes.
    if (input.decision === "approved" || input.decision === "changed") {
      await applyApprovedScoreDraft(tx, {
        workspaceId: input.workspaceId,
        actorId,
        draft: {
          id: draft.id,
          kind: draft.kind,
          conversationId: draft.conversationId,
          reviewId: draft.reviewId,
          suggestedValueJson: draft.suggestedValueJson
        },
        decision: input.decision
      });
    }

    return tx.aiQualityDraft.findUniqueOrThrow({
      where: { id: input.draftId }
    });
  });
}
