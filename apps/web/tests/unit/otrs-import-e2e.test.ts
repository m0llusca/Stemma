import { describe, expect, it, vi } from "vitest";
import { normalizeOtrsFamilyTicketGetResponseForImport } from "@/lib/integrations/otrs-family/normalization";
import { upsertCustomConversation } from "@/lib/conversation-import";
import { customConversationSchema } from "@/lib/validation/custom-api";

/**
 * Synthetic FSA-shaped TicketGet payload: 14 articles alternating
 * customer/agent, the first two private (IsVisibleForCustomer "0"), all with
 * the same naive Moscow wall-clock timestamp and a Cyrillic ticket state.
 */
function fsaShapedTicketGetResponse(): unknown {
  const articles = Array.from({ length: 14 }, (_, index) => ({
    ArticleID: String(index + 1),
    From: index % 2 === 0 ? "customer@fsa.example" : "agent@fsa.example",
    SenderType: index % 2 === 0 ? "customer" : "agent",
    Body: `Сообщение ${index + 1}`,
    Created: "2026-06-06 12:00:06",
    IsVisibleForCustomer: index < 2 ? "0" : "1"
  }));

  // A GenericInterface TicketGet response carries tickets under a top-level
  // `Ticket` key (the operation name is the URL, not a body wrapper).
  return {
    Ticket: [
      {
        TicketID: "1549105",
        TicketNumber: "2026060610000063",
        Title: "Тестовое обращение",
        State: "Ожидает решения разработчика (ФАУ НИА)",
        Queue: "Поддержка",
        Created: "2026-06-06 12:00:06",
        Article: articles
      }
    ]
  };
}

describe("OTRS import end-to-end (FSA-shaped fixture)", () => {
  it("normalizes with the Moscow timezone and persists a queued conversation", async () => {
    const normalized = normalizeOtrsFamilyTicketGetResponseForImport(fsaShapedTicketGetResponse() as never, {
      source: "otrs",
      baseUrl: "https://otrs.example.ru/otrs",
      timeZone: "Europe/Moscow"
    });

    // normalize → exactly one conversation, Moscow wall-clock shifted -3h to UTC.
    expect(normalized).toHaveLength(1);
    const { conversation, stats } = normalized[0];
    expect(conversation.openedAt).toBe("2026-06-06T09:00:06.000Z");
    expect(conversation.messages).toHaveLength(14);
    expect(conversation.messages.filter((message) => message.isPrivate)).toHaveLength(2);
    expect(conversation.messages.every((message) => message.sentAt === "2026-06-06T09:00:06.000Z")).toBe(true);
    expect(stats.privateArticleCount).toBe(2);

    // The normalized payload must satisfy the public custom-API contract.
    const parsed = customConversationSchema.parse(conversation);

    // Mock the prisma transaction client to match the real upsertCustomConversation:
    //   - conversation.upsert({ where, create, update })
    //   - message.upsert(...) once per message
    //   - message.deleteMany({ where })
    //   - samplingRule.findMany is only consulted when options.samplingRules is absent
    // qaStatus is NOT set by the import code; it comes from the Prisma column
    // default (@default(QUEUED)). The mock reproduces that DB default so we can
    // assert the persisted row is QUEUED without exercising a real database.
    let createdConversationData: Record<string, unknown> | undefined;
    const conversationUpsert = vi.fn(async ({ create }: { create: Record<string, unknown> }) => {
      createdConversationData = create;
      return { id: "conv-1", qaStatus: "QUEUED", ...create };
    });
    const messageUpsert = vi.fn(async () => ({}));
    const messageDeleteMany = vi.fn(async () => ({ count: 0 }));
    const samplingRuleFindMany = vi.fn(async () => []);

    const tx = {
      conversation: { upsert: conversationUpsert },
      message: { upsert: messageUpsert, deleteMany: messageDeleteMany },
      samplingRule: { findMany: samplingRuleFindMany }
    };

    const persisted = await upsertCustomConversation("workspace-1", parsed, tx as never, { samplingRules: [] });

    // Import maps TicketID → externalId and reports the message count.
    expect(persisted.externalId).toBe("1549105");
    expect(persisted.messageCount).toBe(14);

    // The conversation row is upserted exactly once.
    expect(conversationUpsert).toHaveBeenCalledTimes(1);
    expect(createdConversationData).toBeDefined();
    // Import code does not write qaStatus itself — the QUEUED column default governs.
    expect(createdConversationData).not.toHaveProperty("qaStatus");
    expect((await conversationUpsert.mock.results[0].value).qaStatus).toBe("QUEUED");

    // All 14 messages persisted via message.upsert; provided sampling rules skip findMany.
    expect(messageUpsert).toHaveBeenCalledTimes(14);
    expect(messageDeleteMany).toHaveBeenCalledTimes(1);
    expect(samplingRuleFindMany).not.toHaveBeenCalled();
  });
});
