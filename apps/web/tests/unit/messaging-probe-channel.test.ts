import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertPublicBaseUrl: vi.fn(),
  guardedFetch: vi.fn()
}));

vi.mock("@/lib/net-guard", () => ({
  assertPublicBaseUrl: mocks.assertPublicBaseUrl,
  guardedFetch: mocks.guardedFetch
}));

describe("probeMessagingChannelWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertPublicBaseUrl.mockResolvedValue(undefined);
  });

  it("blocks WhatsApp regardless of webhook URL", async () => {
    const { probeMessagingChannelWebhook } = await import("@/lib/messaging/probe-channel");

    const result = await probeMessagingChannelWebhook({
      kind: "whatsapp",
      webhookUrl: "https://hooks.example.com/wa"
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/WhatsApp/);
    expect(mocks.guardedFetch).not.toHaveBeenCalled();
  });

  it("treats 2xx as success", async () => {
    mocks.guardedFetch.mockResolvedValue(new Response("ok", { status: 200 }));
    const { probeMessagingChannelWebhook } = await import("@/lib/messaging/probe-channel");

    const result = await probeMessagingChannelWebhook({
      kind: "slack",
      webhookUrl: "https://hooks.slack.com/services/T000/B000/XXXX"
    });

    expect(result).toEqual({ ok: true });
    expect(mocks.assertPublicBaseUrl).toHaveBeenCalled();
    expect(mocks.guardedFetch).toHaveBeenCalled();
  });

  it.each([401, 404, 405, 500])("fails closed on non-2xx HTTP %s", async (status) => {
    mocks.guardedFetch.mockResolvedValue(new Response("nope", { status }));
    const { probeMessagingChannelWebhook } = await import("@/lib/messaging/probe-channel");

    const result = await probeMessagingChannelWebhook({
      kind: "slack",
      webhookUrl: "https://hooks.slack.com/services/T000/B000/XXXX"
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(new RegExp(`HTTP ${status}`));
    expect(result.error).toMatch(/Включение отменено/);
  });

  it("fails closed when guardedFetch throws (network/SSRF)", async () => {
    mocks.guardedFetch.mockRejectedValue(new Error("SSRF blocked"));
    const { probeMessagingChannelWebhook } = await import("@/lib/messaging/probe-channel");

    const result = await probeMessagingChannelWebhook({
      kind: "teams",
      webhookUrl: "https://outlook.office.com/webhook/xxx"
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/недоступен/);
  });

  it("fails closed when assertPublicBaseUrl rejects", async () => {
    mocks.assertPublicBaseUrl.mockRejectedValue(new Error("приватный адрес сети"));
    const { probeMessagingChannelWebhook } = await import("@/lib/messaging/probe-channel");

    const result = await probeMessagingChannelWebhook({
      kind: "slack",
      webhookUrl: "https://127.0.0.1/hooks"
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/приватный адрес сети/);
    expect(mocks.guardedFetch).not.toHaveBeenCalled();
  });
});
