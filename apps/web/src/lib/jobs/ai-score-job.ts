import type { BackendJob } from "@prisma/client";
import { createAiQualityDraft } from "@/lib/ai-quality/drafts";
import type {
  ConversationScorePrediction,
  QualityScoringProvider,
  ScoringCriterionSpec,
  ScoringInput,
  ScoringTranscriptMessage
} from "@/lib/ai-quality/scoring/types";
import { prisma } from "@/lib/db";
import type { BackendJobPayload } from "@/lib/jobs/enqueue";
import { participantLabels } from "@/lib/labels";

export type RunAiScoreJobOptions = {
  /**
   * Injectable scoring backend. Defaults to the resolved provider from
   * "@/lib/ai-quality/scoring" so tests can pass a fake/stub without touching
   * the real adapter or any external network.
   */
  provider?: QualityScoringProvider;
};

export type AiScoreJobResult = {
  conversationId: string;
  draftId: string;
  scorecardId: string;
  criteriaCount: number;
  evidenceCount: number;
  overallConfidence: number;
};

/**
 * A malformed/unscoreable AI response is a terminal failure: there is no point
 * retrying the same conversation against the same model output. The queue
 * caps retries via maxAttempts; this marker keeps the message explicit.
 */
export class AiScoreMalformedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiScoreMalformedError";
  }
}

async function defaultProvider(workspaceId: string): Promise<QualityScoringProvider> {
  // Lazy import mirrors the sibling handlers in queue.ts and keeps this module
  // loadable even while the provider package index is authored in parallel.
  const [{ resolveScoringProvider }, { loadWorkspaceAiCredentials }] = await Promise.all([
    import("@/lib/ai-quality/scoring"),
    import("@/lib/ai-quality/credentials")
  ]);
  const [preference, credentials] = await Promise.all([
    loadWorkspaceProviderPreference(workspaceId),
    loadWorkspaceAiCredentials(workspaceId)
  ]);
  // DB-stored keys take precedence; env vars remain the fallback.
  return resolveScoringProvider(preference, credentials);
}

async function loadWorkspaceProviderPreference(workspaceId: string): Promise<string | undefined> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { aiScoringProvider: true }
  });
  return workspace?.aiScoringProvider ?? undefined;
}

function uniqueEvidenceRefs(prediction: ConversationScorePrediction): string[] {
  const seen = new Set<string>();
  const refs: string[] = [];

  for (const criterion of prediction.criteria) {
    const ref = criterion.evidenceRef;
    if (typeof ref === "string" && ref && !seen.has(ref)) {
      seen.add(ref);
      refs.push(ref);
    }
  }

  return refs;
}

/**
 * AI_SCORE job handler: turns a queued conversation into a "score" AiQualityDraft.
 *
 * Loads the workspace-scoped conversation, its transcript, and the active
 * scorecard criteria; runs the scoring provider; and persists the prediction as
 * an advisory draft (never a final decision). Errors propagate so the queue
 * error path applies retry/backoff and ultimately fails after maxAttempts.
 */
export async function runAiScoreJob(
  job: BackendJob,
  payload: BackendJobPayload,
  options: RunAiScoreJobOptions = {}
): Promise<AiScoreJobResult> {
  const conversationId = typeof payload.conversationId === "string" ? payload.conversationId : null;

  if (!conversationId) {
    throw new AiScoreMalformedError("Для задачи AI-оценки не указан conversationId.");
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, workspaceId: job.workspaceId },
    select: { id: true, subject: true }
  });

  if (!conversation) {
    throw new AiScoreMalformedError("Обращение для AI-оценки не найдено.");
  }

  const scorecard = await prisma.scorecard.findFirst({
    where: { workspaceId: job.workspaceId, isActive: true },
    orderBy: [{ version: "desc" }],
    select: {
      id: true,
      criteria: {
        orderBy: [{ order: "asc" }],
        select: { id: true, key: true, label: true, kind: true, block: true, weight: true }
      }
    }
  });

  if (!scorecard || scorecard.criteria.length === 0) {
    throw new AiScoreMalformedError("Активная оценочная карта с критериями не найдена.");
  }

  const messages = await prisma.message.findMany({
    where: { conversationId: conversation.id, isPrivate: false },
    orderBy: [{ sentAt: "asc" }],
    select: { id: true, participantType: true, authorName: true, body: true }
  });

  const transcript: ScoringTranscriptMessage[] = messages.map((message) => ({
    id: message.id,
    author: participantLabels[message.participantType] ?? message.authorName,
    text: message.body
  }));

  const criteria: ScoringCriterionSpec[] = scorecard.criteria.map((criterion) => ({
    id: criterion.id,
    key: criterion.key,
    label: criterion.label,
    kind: criterion.kind,
    block: criterion.block,
    weight: criterion.weight
  }));

  const provider = options.provider ?? (await defaultProvider(job.workspaceId));

  const input: ScoringInput = {
    conversationId: conversation.id,
    subject: conversation.subject,
    criteria,
    transcript
  };

  // Provider failures (network/adapter) propagate to the queue retry/backoff path.
  const prediction = await provider.scoreConversation(input);

  if (!prediction || !Array.isArray(prediction.criteria) || prediction.criteria.length === 0) {
    // Terminal: a structurally empty prediction will not improve on retry.
    throw new AiScoreMalformedError("Провайдер AI-оценки вернул пустой результат.");
  }

  const evidenceRefs = uniqueEvidenceRefs(prediction);

  // Persist whole-conversation sentiment when the same scoring pass produced it.
  // The score-draft persistence below is independent of this and must stay intact.
  if (prediction.sentiment) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        sentiment: prediction.sentiment.label,
        sentimentScore: prediction.sentiment.score,
        sentimentModel: provider.modelVersion
      }
    });
  }

  const draft = await createAiQualityDraft({
    workspaceId: job.workspaceId,
    conversationId: conversation.id,
    kind: "score",
    modelVersion: provider.modelVersion,
    promptVersion: provider.promptVersion,
    suggestedValue: prediction,
    confidence: prediction.overallConfidence,
    evidenceRefs
  });

  await prisma.backendJobEvent.create({
    data: {
      jobId: job.id,
      level: "info",
      message: "AI-оценка обращения подготовлена.",
      metadata: JSON.stringify({
        conversationId: conversation.id,
        scorecardId: scorecard.id,
        draftId: draft.id,
        provider: provider.name,
        modelVersion: provider.modelVersion,
        promptVersion: provider.promptVersion,
        criteriaCount: prediction.criteria.length,
        evidenceCount: evidenceRefs.length,
        overallConfidence: prediction.overallConfidence,
        ...(prediction.sentiment ? { sentiment: prediction.sentiment.label } : {})
      })
    }
  });

  return {
    conversationId: conversation.id,
    draftId: draft.id,
    scorecardId: scorecard.id,
    criteriaCount: prediction.criteria.length,
    evidenceCount: evidenceRefs.length,
    overallConfidence: prediction.overallConfidence
  };
}
