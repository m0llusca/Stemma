import { describe, expect, it } from "vitest";
import { normalizeTabularConversationRows } from "@/lib/normalizers/tabular-conversations";

describe("tabular conversation normalizer", () => {
  it("groups rows by conversation_id and sorts messages by sent_at", () => {
    const conversations = normalizeTabularConversationRows(
      [
        {
          conversation_id: "conv-1",
          message_id: "m2",
          author_name: "Agent",
          participant_type: "human_agent",
          body: "Ответ оператора",
          sent_at: "2026-04-25T10:05:00Z",
          subject: "Refund from table",
          status: "open",
          customer_name: "Анна"
        },
        {
          conversation_id: "conv-1",
          message_id: "m1",
          author_name: "Анна",
          participant_type: "customer",
          body: "Нужен возврат",
          sent_at: "2026-04-25T10:00:00Z",
          is_private: false
        }
      ],
      { source: "ytsaurus", samplingReason: "Импорт YTsaurus." }
    );

    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({
      externalSource: "ytsaurus",
      externalId: "conv-1",
      channel: "ticket",
      subject: "Refund from table",
      customerName: "Анна",
      status: "open",
      messages: [
        expect.objectContaining({ externalId: "m1", participantType: "customer" }),
        expect.objectContaining({ externalId: "m2", participantType: "human_agent" })
      ]
    });
  });

  it("rejects rows without required fields", () => {
    expect(() =>
      normalizeTabularConversationRows([{ conversation_id: "conv-1", body: "missing fields" }], {
        source: "ydb",
        samplingReason: "Импорт YDB."
      })
    ).toThrow("Строка табличного источника не содержит обязательные поля.");
  });
});
