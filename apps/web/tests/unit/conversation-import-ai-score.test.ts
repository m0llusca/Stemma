import { beforeEach, describe, expect, it, vi } from "vitest";
import { upsertCustomConversation } from "@/lib/conversation-import";
import type { SamplingRuleRecord } from "@/lib/sampling-engine";
import { customConversationSchema, type CustomConversationInput } from "@/lib/validation/custom-api";

function conversationPayload(overrides: Partial<CustomConversationInput> = {}): CustomConversationInput {
  return customConversationSchema.parse({
    externalSource: "custom_api",
    externalId: "ext-1",
    channel: "chat",
    subject: "Вопрос по тарифу",
    status: "open",
    customerName: "Иван",
    samplingReason: "Импорт без правила.",
    openedAt: "2026-06-29T08:00:00.000Z",
    messages: [
      {
        externalId: "m-1",
        participantType: "customer",
        authorName: "Иван",
        body: "Здравствуйте",
        sentAt: "2026-06-29T08:00:00.000Z"
      }
    ],
    ...overrides
  });
}

function selectingRule(targetPercent: number): SamplingRuleRecord {
  return {
    id: "rule-1",
    name: "Случайная выборка",
    type: "random",
    conditionsJson: JSON.stringify({}),
    targetPercent,
    priority: 1
  };
}

function makeTx() {
  const backendJobCreate = vi.fn(async (_args: { data: Record<string, unknown> }) => ({ id: "job-1" }));
  const tx = {
    conversation: {
      upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => ({ id: "conv-1", ...create }))
    },
    message: {
      upsert: vi.fn(async () => ({})),
      deleteMany: vi.fn(async () => ({ count: 0 }))
    },
    backendJob: {
      create: backendJobCreate
    }
  };

  return { tx, backendJobCreate };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("conversation import → AI_SCORE enqueue gate", () => {
  it("enqueues an AI_SCORE job when a sampling rule selects the conversation", async () => {
    const { tx, backendJobCreate } = makeTx();

    await upsertCustomConversation("workspace-1", conversationPayload(), tx as never, {
      // targetPercent 100 → every bucket (0..99) matches deterministically.
      samplingRules: [selectingRule(100)]
    });

    expect(backendJobCreate).toHaveBeenCalledTimes(1);
    const data = backendJobCreate.mock.calls[0][0].data;
    expect(data.type).toBe("AI_SCORE");
    expect(data.workspaceId).toBe("workspace-1");
    expect(JSON.parse(String(data.payloadJson))).toEqual({ conversationId: "conv-1" });
  });

  it("does not enqueue when no sampling rule selects the conversation", async () => {
    const { tx, backendJobCreate } = makeTx();

    await upsertCustomConversation("workspace-1", conversationPayload(), tx as never, {
      // targetPercent 0 → nothing matches.
      samplingRules: [selectingRule(0)]
    });

    expect(backendJobCreate).not.toHaveBeenCalled();
  });

  it("does not enqueue when there are no sampling rules", async () => {
    const { tx, backendJobCreate } = makeTx();

    await upsertCustomConversation("workspace-1", conversationPayload(), tx as never, {
      samplingRules: []
    });

    expect(backendJobCreate).not.toHaveBeenCalled();
  });
});
