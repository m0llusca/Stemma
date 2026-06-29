import type { BackendJob } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ConversationScorePrediction,
  QualityScoringProvider,
  ScoringInput
} from "@/lib/ai-quality/scoring/types";

const mocks = vi.hoisted(() => ({
  prisma: {
    conversation: {
      findFirst: vi.fn()
    },
    message: {
      findMany: vi.fn()
    },
    scorecard: {
      findFirst: vi.fn()
    },
    backendJob: {
      updateMany: vi.fn()
    },
    backendJobEvent: {
      create: vi.fn()
    }
  },
  createAiQualityDraft: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("@/lib/ai-quality/drafts", () => ({
  createAiQualityDraft: mocks.createAiQualityDraft
}));

function backendJob(overrides: Partial<BackendJob> = {}): BackendJob {
  const now = new Date("2026-06-29T08:00:00.000Z");

  return {
    id: "job-1",
    workspaceId: "workspace-1",
    type: "AI_SCORE",
    status: "RUNNING",
    queueName: "default",
    priority: 100,
    payloadJson: JSON.stringify({ conversationId: "conv-1" }),
    resultJson: "{}",
    errorMessage: null,
    attempts: 1,
    maxAttempts: 3,
    runAfter: now,
    lockedAt: now,
    lockedBy: "worker-1",
    startedAt: now,
    finishedAt: null,
    createdById: "user-1",
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function prediction(overrides: Partial<ConversationScorePrediction> = {}): ConversationScorePrediction {
  return {
    criteria: [
      {
        criterionId: "crit-greeting",
        criterionKey: "greeting",
        passed: true,
        confidence: 0.9,
        rationale: "Оператор поздоровался.",
        evidenceRef: "msg-2"
      },
      {
        criterionId: "crit-resolution",
        criterionKey: "resolution",
        value: 3,
        confidence: 0.8,
        rationale: "Вопрос решен полностью.",
        evidenceRef: "msg-4"
      }
    ],
    overallConfidence: 0.85,
    summary: "Диалог обработан качественно.",
    ...overrides
  };
}

function fakeProvider(result: ConversationScorePrediction): QualityScoringProvider & { calls: ScoringInput[] } {
  const calls: ScoringInput[] = [];
  return {
    name: "fake",
    modelVersion: "fake-model-v9",
    promptVersion: "fake-prompt-v9",
    calls,
    async scoreConversation(input: ScoringInput) {
      calls.push(input);
      return result;
    }
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  mocks.prisma.conversation.findFirst.mockResolvedValue({
    id: "conv-1",
    workspaceId: "workspace-1",
    subject: "Не приходит код подтверждения"
  });
  mocks.prisma.message.findMany.mockResolvedValue([
    { id: "msg-1", participantType: "CUSTOMER", authorName: "Иван", body: "Не приходит код." },
    { id: "msg-2", participantType: "HUMAN_AGENT", authorName: "Анна", body: "Здравствуйте, помогу." },
    { id: "msg-4", participantType: "HUMAN_AGENT", authorName: "Анна", body: "Код отправлен повторно." }
  ]);
  mocks.prisma.scorecard.findFirst.mockResolvedValue({
    id: "card-1",
    isActive: true,
    criteria: [
      { id: "crit-greeting", key: "greeting", label: "Приветствие", kind: "PASS_FAIL", block: "Начало", weight: 1 },
      { id: "crit-resolution", key: "resolution", label: "Решение", kind: "SCALE_1_3", block: "Итог", weight: 3 }
    ]
  });
  mocks.prisma.backendJob.updateMany.mockResolvedValue({ count: 1 });
  mocks.prisma.backendJobEvent.create.mockResolvedValue({});
  mocks.createAiQualityDraft.mockResolvedValue({ id: "draft-1" });
});

describe("runAiScoreJob", () => {
  it("persists a score draft from the injected provider", async () => {
    const { runAiScoreJob } = await import("@/lib/jobs/ai-score-job");
    const provider = fakeProvider(prediction());

    const result = await runAiScoreJob(backendJob(), { conversationId: "conv-1" }, { provider });

    // The provider received a ScoringInput built from the conversation + active scorecard.
    expect(provider.calls).toHaveLength(1);
    const input = provider.calls[0];
    expect(input.conversationId).toBe("conv-1");
    expect(input.subject).toBe("Не приходит код подтверждения");
    expect(input.criteria.map((c) => c.key)).toEqual(["greeting", "resolution"]);
    expect(input.criteria[0]).toMatchObject({ id: "crit-greeting", kind: "PASS_FAIL", block: "Начало", weight: 1 });
    // Transcript uses humanized author labels + stable message ids.
    expect(input.transcript).toEqual([
      { id: "msg-1", author: "Клиент", text: "Не приходит код." },
      { id: "msg-2", author: "Оператор", text: "Здравствуйте, помогу." },
      { id: "msg-4", author: "Оператор", text: "Код отправлен повторно." }
    ]);

    // The prediction is persisted as a "score" draft carrying confidence + evidence refs.
    expect(mocks.createAiQualityDraft).toHaveBeenCalledTimes(1);
    const draftInput = mocks.createAiQualityDraft.mock.calls[0][0];
    expect(draftInput).toMatchObject({
      workspaceId: "workspace-1",
      conversationId: "conv-1",
      kind: "score",
      modelVersion: "fake-model-v9",
      promptVersion: "fake-prompt-v9",
      confidence: 0.85
    });
    expect(draftInput.suggestedValue).toEqual(prediction());
    // Evidence refs are the unique per-criterion evidence message ids.
    expect(draftInput.evidenceRefs).toEqual(["msg-2", "msg-4"]);

    // A backend job event is recorded like the sibling handlers.
    expect(mocks.prisma.backendJobEvent.create).toHaveBeenCalledTimes(1);

    expect(result).toMatchObject({ conversationId: "conv-1", draftId: "draft-1" });
  });

  it("dedupes evidence refs and drops missing ones", async () => {
    const { runAiScoreJob } = await import("@/lib/jobs/ai-score-job");
    const provider = fakeProvider(
      prediction({
        criteria: [
          { criterionId: "a", criterionKey: "a", passed: true, confidence: 0.5, rationale: "x", evidenceRef: "msg-2" },
          { criterionId: "b", criterionKey: "b", passed: false, confidence: 0.5, rationale: "y", evidenceRef: "msg-2" },
          { criterionId: "c", criterionKey: "c", passed: false, confidence: 0.5, rationale: "z" }
        ],
        overallConfidence: 0.5,
        summary: "s"
      })
    );

    await runAiScoreJob(backendJob(), { conversationId: "conv-1" }, { provider });

    const draftInput = mocks.createAiQualityDraft.mock.calls[0][0];
    expect(draftInput.evidenceRefs).toEqual(["msg-2"]);
  });

  it("throws a terminal error when the conversation is missing", async () => {
    mocks.prisma.conversation.findFirst.mockResolvedValue(null);
    const { runAiScoreJob } = await import("@/lib/jobs/ai-score-job");
    const provider = fakeProvider(prediction());

    await expect(runAiScoreJob(backendJob(), { conversationId: "missing" }, { provider })).rejects.toThrow();
    expect(mocks.createAiQualityDraft).not.toHaveBeenCalled();
  });

  it("throws when there is no active scorecard", async () => {
    mocks.prisma.scorecard.findFirst.mockResolvedValue(null);
    const { runAiScoreJob } = await import("@/lib/jobs/ai-score-job");
    const provider = fakeProvider(prediction());

    await expect(runAiScoreJob(backendJob(), { conversationId: "conv-1" }, { provider })).rejects.toThrow();
    expect(mocks.createAiQualityDraft).not.toHaveBeenCalled();
  });

  it("propagates provider failures so the queue can apply retry/backoff", async () => {
    const { runAiScoreJob } = await import("@/lib/jobs/ai-score-job");
    const provider: QualityScoringProvider = {
      name: "boom",
      modelVersion: "m",
      promptVersion: "p",
      async scoreConversation() {
        throw new Error("Провайдер недоступен.");
      }
    };

    await expect(runAiScoreJob(backendJob(), { conversationId: "conv-1" }, { provider })).rejects.toThrow(
      "Провайдер недоступен."
    );
    expect(mocks.createAiQualityDraft).not.toHaveBeenCalled();
  });
});
