import { describe, expect, it } from "vitest";
import { encryptSecret } from "@/lib/secrets";
import { sendToChannel } from "@/lib/messaging/send";
import type { MessagingTransport, MessagingTransportRequest } from "@/lib/messaging/http";

function fakeTransport(
  response: { statusCode: number; body?: string } = { statusCode: 200, body: "ok" }
): MessagingTransport & { calls: MessagingTransportRequest[] } {
  const calls: MessagingTransportRequest[] = [];
  const transport = (async (request: MessagingTransportRequest) => {
    calls.push(request);
    return { statusCode: response.statusCode, body: response.body ?? "" };
  }) as MessagingTransport & { calls: MessagingTransportRequest[] };
  transport.calls = calls;
  return transport;
}

const context = {
  title: "Проверка финализирована",
  body: "Оценка по обращению готова.",
  href: "https://app.example.com/reviews/rev-1"
};

describe("sendToChannel", () => {
  it("POSTs a Slack { text } body to the configured webhook URL", async () => {
    const transport = fakeTransport();
    const result = await sendToChannel(
      { kind: "slack", configJson: JSON.stringify({ webhookUrl: "https://hooks.slack.com/xyz" }), secretRef: null },
      context,
      { transport }
    );

    expect(result.ok).toBe(true);
    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0].method).toBe("POST");
    expect(transport.calls[0].url).toBe("https://hooks.slack.com/xyz");
    const body = JSON.parse(transport.calls[0].body ?? "{}");
    expect(body).toEqual({
      text: "Проверка финализирована\nОценка по обращению готова.\nhttps://app.example.com/reviews/rev-1"
    });
  });

  it("POSTs a Teams MessageCard with summary + text", async () => {
    const transport = fakeTransport();
    const result = await sendToChannel(
      { kind: "teams", configJson: JSON.stringify({ webhookUrl: "https://outlook.office.com/webhook/abc" }), secretRef: null },
      context,
      { transport }
    );

    expect(result.ok).toBe(true);
    const body = JSON.parse(transport.calls[0].body ?? "{}");
    expect(body["@type"]).toBe("MessageCard");
    expect(body.summary).toBe("Проверка финализирована");
    expect(body.text).toContain("Оценка по обращению готова.");
  });

  it("POSTs a Telegram { text, chat_id } body to the configured send URL", async () => {
    const transport = fakeTransport();
    const result = await sendToChannel(
      {
        kind: "telegram",
        configJson: JSON.stringify({
          webhookUrl: "https://api.telegram.org/bot123/sendMessage",
          chatId: "-1001"
        }),
        secretRef: null
      },
      context,
      { transport }
    );

    expect(result.ok).toBe(true);
    expect(transport.calls[0].url).toBe("https://api.telegram.org/bot123/sendMessage");
    const body = JSON.parse(transport.calls[0].body ?? "{}");
    expect(body.chat_id).toBe("-1001");
    expect(body.text).toContain("Проверка финализирована");
  });

  it("decrypts secretRef and reads telegram chat_id from it when not in config", async () => {
    const transport = fakeTransport();
    await sendToChannel(
      {
        kind: "telegram",
        configJson: JSON.stringify({ webhookUrl: "https://api.telegram.org/bot123/sendMessage" }),
        secretRef: encryptSecret("-1009999")
      },
      context,
      { transport }
    );

    const body = JSON.parse(transport.calls[0].body ?? "{}");
    expect(body.chat_id).toBe("-1009999");
  });

  it("returns a failure result (does not throw) on a non-2xx response", async () => {
    const transport = fakeTransport({ statusCode: 500, body: "boom" });
    const result = await sendToChannel(
      { kind: "slack", configJson: JSON.stringify({ webhookUrl: "https://hooks.slack.com/xyz" }), secretRef: null },
      context,
      { transport }
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("500");
  });

  it("reports WhatsApp as an unsupported (non-throwing) stub without POSTing", async () => {
    const transport = fakeTransport();
    const result = await sendToChannel(
      { kind: "whatsapp", configJson: JSON.stringify({ webhookUrl: "https://example.com/wa" }), secretRef: null },
      context,
      { transport }
    );

    expect(result.ok).toBe(false);
    expect(result.unsupported).toBe(true);
    expect(transport.calls).toHaveLength(0);
  });

  it("fails cleanly when the webhook URL is missing", async () => {
    const transport = fakeTransport();
    const result = await sendToChannel(
      { kind: "slack", configJson: JSON.stringify({}), secretRef: null },
      context,
      { transport }
    );

    expect(result.ok).toBe(false);
    expect(transport.calls).toHaveLength(0);
  });
});
