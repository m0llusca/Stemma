import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendToChannel } from "@/lib/messaging/send";
import type { MessagingTransport, MessagingTransportRequest } from "@/lib/messaging/http";

const SSRF_MESSAGE = /приватный адрес сети|QC_ALLOW_PRIVATE_BASE_URLS/;

const mocks = vi.hoisted(() => ({
  assertCanPersistSettings: vi.fn(),
  auditLog: vi.fn(),
  requireCurrentUserPermission: vi.fn(),
  revalidatePath: vi.fn(),
  encryptSecret: vi.fn(),
  channelUpsert: vi.fn(),
  channelUpdate: vi.fn(),
  channelFindUnique: vi.fn(),
  probeMessagingChannelWebhook: vi.fn()
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath
}));

vi.mock("@/lib/audit", () => ({
  auditLog: mocks.auditLog
}));

vi.mock("@/lib/current-user", () => ({
  assertCanPersistSettings: mocks.assertCanPersistSettings,
  requireCurrentUserPermission: mocks.requireCurrentUserPermission
}));

vi.mock("@/lib/secrets", () => ({
  encryptSecret: mocks.encryptSecret
}));

vi.mock("@/lib/messaging/probe-channel", () => ({
  probeMessagingChannelWebhook: mocks.probeMessagingChannelWebhook
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    messagingChannel: {
      upsert: mocks.channelUpsert,
      update: mocks.channelUpdate,
      findUnique: mocks.channelFindUnique
    }
  }
}));

function buildSaveForm(webhookUrl: string) {
  const formData = new FormData();
  formData.set("kind", "slack");
  formData.set("displayName", "Slack");
  formData.set("webhookUrl", webhookUrl);
  formData.set("token", "");
  formData.set("status", "active");
  return formData;
}

function fakeTransport(): MessagingTransport & { calls: MessagingTransportRequest[] } {
  const calls: MessagingTransportRequest[] = [];
  const transport = (async (request: MessagingTransportRequest) => {
    calls.push(request);
    return { statusCode: 200, body: "ok" };
  }) as MessagingTransport & { calls: MessagingTransportRequest[] };
  transport.calls = calls;
  return transport;
}

const context = {
  title: "Проверка",
  body: "Тело",
  href: "https://app.example.com/reviews/1"
};

describe("messaging webhook SSRF guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentUserPermission.mockResolvedValue({
      id: "user-1234567890",
      workspaceId: "workspace-1"
    });
    mocks.encryptSecret.mockImplementation((value: string) => `enc(${value})`);
    mocks.channelUpsert.mockResolvedValue({
      id: "channel-1",
      kind: "slack",
      displayName: "Slack",
      status: "active"
    });
    mocks.channelFindUnique.mockResolvedValue(null);
    mocks.probeMessagingChannelWebhook.mockResolvedValue({ ok: true });
    mocks.auditLog.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ["http://127.0.0.1/hooks", "loopback"],
    ["http://localhost:8080/hooks", "localhost"],
    ["http://10.0.0.5/hooks", "private 10/8"],
    ["http://169.254.169.254/latest/meta-data", "cloud metadata"],
    ["http://192.168.1.10/hooks", "private 192.168/16"]
  ])("rejects private webhook on save: %s (%s)", async (webhookUrl) => {
    const { saveMessagingChannel } = await import("@/lib/messaging-actions");

    const state = await saveMessagingChannel({ status: "idle" }, buildSaveForm(webhookUrl));

    expect(state.status).toBe("error");
    expect(state.message).toMatch(SSRF_MESSAGE);
    expect(mocks.channelUpsert).not.toHaveBeenCalled();
  });

  it("accepts a public https webhook on save", async () => {
    const { saveMessagingChannel } = await import("@/lib/messaging-actions");
    const webhookUrl = "https://hooks.slack.com/services/T000/B000/XXXX";

    const state = await saveMessagingChannel({ status: "idle" }, buildSaveForm(webhookUrl));

    expect(state.status).toBe("success");
    expect(mocks.channelUpsert).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mocks.channelUpsert.mock.calls[0][0].create.configJson)).toEqual({ webhookUrl });
  });

  it.each([
    ["http://127.0.0.1/hooks", "loopback"],
    ["http://169.254.169.254/latest/meta-data", "cloud metadata"],
    ["http://10.0.0.5/hooks", "private 10/8"]
  ])("rejects private webhook at send time: %s (%s)", async (webhookUrl) => {
    const transport = fakeTransport();
    const result = await sendToChannel(
      { kind: "slack", configJson: JSON.stringify({ webhookUrl }), secretRef: null },
      context,
      { transport }
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(SSRF_MESSAGE);
    expect(transport.calls).toHaveLength(0);
  });

  it("allows public https webhook at send time", async () => {
    const transport = fakeTransport();
    const result = await sendToChannel(
      {
        kind: "slack",
        configJson: JSON.stringify({ webhookUrl: "https://hooks.slack.com/services/T000/B000/XXXX" }),
        secretRef: null
      },
      context,
      { transport }
    );

    expect(result.ok).toBe(true);
    expect(transport.calls).toHaveLength(1);
  });
});
