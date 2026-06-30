import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertCanPersistSettings: vi.fn(),
  auditLog: vi.fn(),
  requireCurrentUserPermission: vi.fn(),
  revalidatePath: vi.fn(),
  encryptSecret: vi.fn(),
  channelUpsert: vi.fn(),
  channelUpdate: vi.fn()
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

vi.mock("@/lib/db", () => ({
  prisma: {
    messagingChannel: {
      upsert: mocks.channelUpsert,
      update: mocks.channelUpdate
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
    mocks.auditLog.mockResolvedValue({});
  });

  it("upserts a channel with configJson.webhookUrl and an encrypted secretRef", async () => {
    const { saveMessagingChannel } = await import("@/lib/messaging-actions");

    const state = await saveMessagingChannel({ status: "idle" }, buildSaveForm());

    expect(mocks.requireCurrentUserPermission).toHaveBeenCalledWith("backend_jobs:manage");
    expect(mocks.assertCanPersistSettings).toHaveBeenCalled();

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
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/channels");
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

    await setMessagingChannelStatus(formData);

    expect(mocks.requireCurrentUserPermission).toHaveBeenCalledWith("backend_jobs:manage");
    expect(mocks.assertCanPersistSettings).toHaveBeenCalled();
    expect(mocks.channelUpdate).toHaveBeenCalledWith({
      where: { workspaceId_kind: { workspaceId: "workspace-1", kind: "slack" } },
      data: { status: "draft" }
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/channels");
  });

  it("rejects an unknown status in setMessagingChannelStatus", async () => {
    const { setMessagingChannelStatus } = await import("@/lib/messaging-actions");
    const formData = new FormData();
    formData.set("kind", "slack");
    formData.set("status", "deleted");

    await expect(setMessagingChannelStatus(formData)).rejects.toThrow();
    expect(mocks.channelUpdate).not.toHaveBeenCalled();
  });

  it("rejects an unknown kind in setMessagingChannelStatus", async () => {
    const { setMessagingChannelStatus } = await import("@/lib/messaging-actions");
    const formData = new FormData();
    formData.set("kind", "carrier-pigeon");
    formData.set("status", "active");

    await expect(setMessagingChannelStatus(formData)).rejects.toThrow();
    expect(mocks.channelUpdate).not.toHaveBeenCalled();
  });
});
