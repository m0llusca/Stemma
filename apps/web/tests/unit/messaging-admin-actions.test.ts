import { beforeEach, describe, expect, it, vi } from "vitest";

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

function buildSaveForm(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  formData.set("kind", "slack");
  formData.set("displayName", "Slack рабочая команда");
  formData.set("webhookUrl", "https://hooks.slack.com/services/T000/B000/XXXX");
  formData.set("token", "super-secret-token");
  formData.set("status", "active");

  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }

  return formData;
}

describe("messaging channel admin actions", () => {
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
      displayName: "Slack рабочая команда",
      status: "active"
    });
    mocks.channelUpdate.mockResolvedValue({
      id: "channel-1",
      kind: "slack",
      status: "draft"
    });
    mocks.channelFindUnique.mockResolvedValue({
      configJson: JSON.stringify({ webhookUrl: "https://hooks.slack.com/services/T000/B000/XXXX" })
    });
    mocks.probeMessagingChannelWebhook.mockResolvedValue({ ok: true });
    mocks.auditLog.mockResolvedValue({});
  });

  it("probes before upsert and warns that activate is not live certification", async () => {
    const { saveMessagingChannel } = await import("@/lib/messaging-actions");
    const { activateProbePassedNotLiveCopy } = await import("@/lib/integrations/probe-honesty");

    const state = await saveMessagingChannel({ status: "idle" }, buildSaveForm());

    expect(mocks.requireCurrentUserPermission).toHaveBeenCalledWith("backend_jobs:manage");
    expect(mocks.assertCanPersistSettings).toHaveBeenCalled();
    expect(mocks.probeMessagingChannelWebhook).toHaveBeenCalledWith({
      kind: "slack",
      webhookUrl: "https://hooks.slack.com/services/T000/B000/XXXX"
    });
    expect(mocks.probeMessagingChannelWebhook.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.channelUpsert.mock.invocationCallOrder[0]
    );

    expect(mocks.channelUpsert).toHaveBeenCalledTimes(1);
    const args = mocks.channelUpsert.mock.calls[0][0];

    expect(args.where).toEqual({
      workspaceId_kind: { workspaceId: "workspace-1", kind: "slack" }
    });

    // configJson stores the webhook target as JSON.stringify({ webhookUrl }).
    expect(JSON.parse(args.create.configJson)).toEqual({
      webhookUrl: "https://hooks.slack.com/services/T000/B000/XXXX"
    });
    expect(JSON.parse(args.update.configJson)).toEqual({
      webhookUrl: "https://hooks.slack.com/services/T000/B000/XXXX"
    });

    // The token is encrypted before storage; the raw token is never persisted.
    expect(mocks.encryptSecret).toHaveBeenCalledWith("super-secret-token");
    expect(args.create.secretRef).toBe("enc(super-secret-token)");
    expect(args.update.secretRef).toBe("enc(super-secret-token)");

    expect(args.create.status).toBe("active");
    expect(args.update.status).toBe("active");
    expect(args.create.kind).toBe("slack");

    expect(state.status).toBe("success");
    expect(state.tone).toBe("warning");
    expect(state.message).toContain(activateProbePassedNotLiveCopy);
    expect(state.message).not.toMatch(/сертификац\w+ пройден/i);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/channels");
  });

  it("blocks activate when probe fails and does not persist", async () => {
    mocks.probeMessagingChannelWebhook.mockResolvedValue({
      ok: false,
      error: "Probe не прошёл: webhook недоступен. Включение отменено."
    });
    const { saveMessagingChannel } = await import("@/lib/messaging-actions");

    const state = await saveMessagingChannel({ status: "idle" }, buildSaveForm());

    expect(state.status).toBe("error");
    expect(state.tone).toBe("negative");
    expect(state.message).toMatch(/probe|недоступен/i);
    expect(mocks.channelUpsert).not.toHaveBeenCalled();
  });

  it("blocks claim_live without live cert before persist", async () => {
    const { saveMessagingChannel } = await import("@/lib/messaging-actions");
    const { claimLiveWithoutCertCopy } = await import("@/lib/integrations/probe-honesty");

    const state = await saveMessagingChannel(
      { status: "idle" },
      buildSaveForm({ claimLive: "1", status: "draft" })
    );

    expect(mocks.probeMessagingChannelWebhook).toHaveBeenCalled();
    expect(state.status).toBe("error");
    expect(state.tone).toBe("negative");
    expect(state.message).toBe(claimLiveWithoutCertCopy);
    expect(mocks.channelUpsert).not.toHaveBeenCalled();
  });

  it("warns that a draft save is not live certification", async () => {
    const { saveMessagingChannel } = await import("@/lib/messaging-actions");

    const state = await saveMessagingChannel(
      { status: "idle" },
      buildSaveForm({ status: "draft" })
    );

    expect(mocks.probeMessagingChannelWebhook).not.toHaveBeenCalled();
    expect(state.status).toBe("success");
    expect(state.tone).toBe("warning");
    expect(state.message).toMatch(/≠ живая сертификация/);
    expect(state.message).not.toMatch(/активирован/i);
  });

  it("preserves an existing secretRef when no new token is provided", async () => {
    const { saveMessagingChannel } = await import("@/lib/messaging-actions");

    await saveMessagingChannel({ status: "idle" }, buildSaveForm({ token: "" }));

    const args = mocks.channelUpsert.mock.calls[0][0];
    expect(mocks.encryptSecret).not.toHaveBeenCalled();
    // Do not clobber an existing secret with an update when the field is blank.
    expect(args.update).not.toHaveProperty("secretRef");
    // On create there is nothing to preserve.
    expect(args.create.secretRef).toBeNull();
  });

  it("rejects a kind that is not in the messaging channel registry", async () => {
    const { saveMessagingChannel } = await import("@/lib/messaging-actions");

    const state = await saveMessagingChannel({ status: "idle" }, buildSaveForm({ kind: "carrier-pigeon" }));

    expect(state.status).toBe("error");
    expect(mocks.channelUpsert).not.toHaveBeenCalled();
  });

  it("requires a webhook URL when activating a channel", async () => {
    const { saveMessagingChannel } = await import("@/lib/messaging-actions");

    const state = await saveMessagingChannel({ status: "idle" }, buildSaveForm({ webhookUrl: "" }));

    expect(state.status).toBe("error");
    expect(mocks.channelUpsert).not.toHaveBeenCalled();
    expect(mocks.probeMessagingChannelWebhook).not.toHaveBeenCalled();
  });

  it("never exposes the raw secret in the audit metadata", async () => {
    const { saveMessagingChannel } = await import("@/lib/messaging-actions");

    await saveMessagingChannel({ status: "idle" }, buildSaveForm());

    const auditCalls = mocks.auditLog.mock.calls.map((call) => JSON.stringify(call[0]));
    for (const serialized of auditCalls) {
      expect(serialized).not.toContain("super-secret-token");
    }
  });

  it("flips an existing channel status with setMessagingChannelStatus", async () => {
    const { setMessagingChannelStatus } = await import("@/lib/messaging-actions");
    const formData = new FormData();
    formData.set("kind", "slack");
    formData.set("status", "draft");

    const state = await setMessagingChannelStatus({ status: "idle" }, formData);

    expect(mocks.requireCurrentUserPermission).toHaveBeenCalledWith("backend_jobs:manage");
    expect(mocks.assertCanPersistSettings).toHaveBeenCalled();
    expect(mocks.probeMessagingChannelWebhook).not.toHaveBeenCalled();
    expect(mocks.channelUpdate).toHaveBeenCalledWith({
      where: { workspaceId_kind: { workspaceId: "workspace-1", kind: "slack" } },
      data: { status: "draft" }
    });
    expect(state.status).toBe("success");
    expect(state.tone).toBe("neutral");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/channels");
  });

  it("probes before status toggle activate and does not claim live cert", async () => {
    mocks.channelUpdate.mockResolvedValue({
      id: "channel-1",
      kind: "slack",
      status: "active"
    });
    const { setMessagingChannelStatus } = await import("@/lib/messaging-actions");
    const { activateProbePassedNotLiveCopy } = await import("@/lib/integrations/probe-honesty");
    const formData = new FormData();
    formData.set("kind", "slack");
    formData.set("status", "active");

    const state = await setMessagingChannelStatus({ status: "idle" }, formData);

    expect(mocks.probeMessagingChannelWebhook).toHaveBeenCalled();
    expect(mocks.probeMessagingChannelWebhook.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.channelUpdate.mock.invocationCallOrder[0]
    );
    expect(mocks.channelUpdate).toHaveBeenCalledWith({
      where: { workspaceId_kind: { workspaceId: "workspace-1", kind: "slack" } },
      data: { status: "active" }
    });
    expect(state.status).toBe("success");
    expect(state.tone).toBe("warning");
    expect(state.message).toContain(activateProbePassedNotLiveCopy);
    expect(state.message).not.toMatch(/сертификац\w+ пройден/i);
    expect(state.message).not.toMatch(/live-ready/i);
  });

  it("blocks status toggle activate when probe fails", async () => {
    mocks.probeMessagingChannelWebhook.mockResolvedValue({
      ok: false,
      error: "Probe не прошёл: webhook недоступен. Включение отменено."
    });
    const { setMessagingChannelStatus } = await import("@/lib/messaging-actions");
    const formData = new FormData();
    formData.set("kind", "slack");
    formData.set("status", "active");

    const state = await setMessagingChannelStatus({ status: "idle" }, formData);

    expect(state.status).toBe("error");
    expect(mocks.channelUpdate).not.toHaveBeenCalled();
  });

  it("rejects an unknown status in setMessagingChannelStatus", async () => {
    const { setMessagingChannelStatus } = await import("@/lib/messaging-actions");
    const formData = new FormData();
    formData.set("kind", "slack");
    formData.set("status", "deleted");

    await expect(setMessagingChannelStatus({ status: "idle" }, formData)).rejects.toThrow();
    expect(mocks.channelUpdate).not.toHaveBeenCalled();
  });

  it("rejects an unknown kind in setMessagingChannelStatus", async () => {
    const { setMessagingChannelStatus } = await import("@/lib/messaging-actions");
    const formData = new FormData();
    formData.set("kind", "carrier-pigeon");
    formData.set("status", "active");

    await expect(setMessagingChannelStatus({ status: "idle" }, formData)).rejects.toThrow();
    expect(mocks.channelUpdate).not.toHaveBeenCalled();
  });
});
