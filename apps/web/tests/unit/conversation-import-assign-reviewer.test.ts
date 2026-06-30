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

function makeTx(
  options: {
    users?: { id: string; name: string }[];
    counts?: Record<string, number>;
    existing?: { qaAssigneeId: string | null; qaAssigneeName: string | null } | null;
  } = {}
) {
  const users = options.users ?? [{ id: "u-1", name: "Анна" }];
  const counts = options.counts ?? {};
  const existing = options.existing ?? null;
  const conversationUpsert = vi.fn(async ({ create }: { create: Record<string, unknown> }) => ({
    id: "conv-1",
    ...create
  }));

  const tx = {
    conversation: {
      upsert: conversationUpsert,
      findUnique: vi.fn(async () => existing),
      count: vi.fn(async ({ where }: { where: { qaAssigneeName?: string } }) => counts[where.qaAssigneeName ?? ""] ?? 0)
    },
    message: {
      upsert: vi.fn(async () => ({})),
      deleteMany: vi.fn(async () => ({ count: 0 }))
    },
    user: {
      findMany: vi.fn(async () => users)
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

describe("conversation import → auto-assign reviewer", () => {
  it("assigns the least-loaded reviewer when a sampling rule selects the conversation", async () => {
    const { tx, conversationUpsert } = makeTx({
      users: [
        { id: "u-1", name: "Анна" },
        { id: "u-2", name: "Борис" }
      ],
      counts: { Анна: 3, Борис: 1 }
    });

    await upsertCustomConversation("workspace-1", conversationPayload(), tx as never, {
      samplingRules: [selectingRule(100)]
    });

    const created = conversationUpsert.mock.calls[0][0].create;
    expect(created.qaAssigneeId).toBe("u-2");
    expect(created.qaAssigneeName).toBe("Борис");
  });

  it("leaves qaAssignee untouched when no sampling rule matched", async () => {
    const { tx, conversationUpsert } = makeTx();

    await upsertCustomConversation("workspace-1", conversationPayload(), tx as never, {
      samplingRules: [selectingRule(0)]
    });

    const created = conversationUpsert.mock.calls[0][0].create;
    expect(created.qaAssigneeId).toBeUndefined();
    expect(created.qaAssigneeName).toBeUndefined();
  });

  it("leaves qaAssignee untouched when sampling matched but there are no candidate reviewers", async () => {
    const { tx, conversationUpsert } = makeTx({ users: [] });

    await upsertCustomConversation("workspace-1", conversationPayload(), tx as never, {
      samplingRules: [selectingRule(100)]
    });

    const created = conversationUpsert.mock.calls[0][0].create;
    expect(created.qaAssigneeId).toBeUndefined();
    expect(created.qaAssigneeName).toBeUndefined();
  });

  it("does not reassign a conversation that already carries an assignee", async () => {
    const { tx, conversationUpsert } = makeTx({
      users: [{ id: "u-2", name: "Борис" }],
      existing: { qaAssigneeId: "u-1", qaAssigneeName: "Анна" }
    });

    await upsertCustomConversation("workspace-1", conversationPayload(), tx as never, {
      samplingRules: [selectingRule(100)]
    });

    const created = conversationUpsert.mock.calls[0][0].create;
    expect(created.qaAssigneeId).toBeUndefined();
    expect(created.qaAssigneeName).toBeUndefined();
    expect(tx.user.findMany).not.toHaveBeenCalled();
  });
});
