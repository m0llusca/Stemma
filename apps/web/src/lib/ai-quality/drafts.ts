import { prisma } from "@/lib/db";
import type { AiQualityDraftDecision, AiQualityDraftKind } from "@/lib/ai-quality/types";

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

  return prisma.aiQualityDraft.update({
    where: { id: input.draftId },
    data: {
      status: input.decision,
      finalizedById: actorId,
      finalizedAt: input.decidedAt ?? new Date(),
      decisionReason: input.reason?.trim() ? input.reason.trim() : null,
      ...(Object.hasOwn(input, "changedValue") ? { suggestedValueJson: jsonText(input.changedValue, {}) } : {})
    }
  });
}
