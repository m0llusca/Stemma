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
    assigneeName: "Анна",
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

function nonSelectingRule(): SamplingRuleRecord {
  return {
    id: "rule-1",
    name: "Ничего не выбирает",
    type: "random",
    conditionsJson: JSON.stringify({}),
    targetPercent: 0,
    priority: 1
  };
}

function makeTx(
  options: {
    assigneeMatches?: { id: string; name: string }[];
  } = {}
) {
  const assigneeMatches = options.assigneeMatches ?? [{ id: "agent-anna", name: "Анна" }];
  const conversationUpsert = vi.fn(
    async ({ create }: { create: Record<string, unknown>; update: Record<string, unknown> }) => ({
      id: "conv-1",
      ...create
    })
  );

  const tx = {
    conversation: {
      upsert: conversationUpsert,
      findUnique: vi.fn(async () => null),
      count: vi.fn(async () => 0)
    },
    message: {
      upsert: vi.fn(async () => ({})),
      deleteMany: vi.fn(async () => ({ count: 0 }))
    },
    user: {
      // Used by the assignee-name → id resolver.
      findMany: vi.fn(async () => assigneeMatches)
    },
    backendJob: {
      create: vi.fn(async () => ({ id: "job-1" }))
    }
  };

  return { tx, conversationUpsert };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("conversation import → resolve assigneeId from name", () => {
  it("sets assigneeId when the name resolves to exactly one workspace user", async () => {
    const { tx, conversationUpsert } = makeTx({
      assigneeMatches: [{ id: "agent-anna", name: "Анна" }]
    });

    await upsertCustomConversation("workspace-1", conversationPayload({ assigneeName: "Анна" }), tx as never, {
      samplingRules: [nonSelectingRule()]
    });

    const created = conversationUpsert.mock.calls[0][0].create;
    expect(created.assigneeName).toBe("Анна");
    expect(created.assigneeId).toBe("agent-anna");
    const updated = conversationUpsert.mock.calls[0][0].update;
    expect(updated.assigneeId).toBe("agent-anna");
  });

  it("leaves assigneeId null when the name is ambiguous (multiple matches, fail-closed)", async () => {
    const { tx, conversationUpsert } = makeTx({
      assigneeMatches: [
        { id: "agent-anna-1", name: "Анна" },
        { id: "agent-anna-2", name: "Анна" }
      ]
    });

    await upsertCustomConversation("workspace-1", conversationPayload({ assigneeName: "Анна" }), tx as never, {
      samplingRules: [nonSelectingRule()]
    });

    const created = conversationUpsert.mock.calls[0][0].create;
    expect(created.assigneeName).toBe("Анна");
    expect(created.assigneeId ?? null).toBeNull();
  });

  it("leaves assigneeId null when the name resolves to no user (fail-closed)", async () => {
    const { tx, conversationUpsert } = makeTx({ assigneeMatches: [] });

    await upsertCustomConversation("workspace-1", conversationPayload({ assigneeName: "Неизвестный" }), tx as never, {
      samplingRules: [nonSelectingRule()]
    });

    const created = conversationUpsert.mock.calls[0][0].create;
    expect(created.assigneeId ?? null).toBeNull();
  });

  it("leaves assigneeId null and skips the lookup when the payload has no assignee name", async () => {
    const { tx, conversationUpsert } = makeTx();

    await upsertCustomConversation("workspace-1", conversationPayload({ assigneeName: undefined }), tx as never, {
      samplingRules: [nonSelectingRule()]
    });

    const created = conversationUpsert.mock.calls[0][0].create;
    expect(created.assigneeId ?? null).toBeNull();
    // No point querying users when there is no name to resolve.
    expect(tx.user.findMany).not.toHaveBeenCalled();
  });
});
