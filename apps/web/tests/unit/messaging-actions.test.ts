import { describe, expect, it, vi } from "vitest";

const deliveryCreateMock = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    messagingDelivery: {
      create: deliveryCreateMock
    }
  }
}));

describe("messaging action channels", () => {
  it("declares Slack and Teams as action channels before ingest channels", async () => {
    const { messagingChannelRegistry } = await import("@/lib/messaging/registry");

    expect(messagingChannelRegistry.slack.capabilities).toEqual(["action_notification"]);
    expect(messagingChannelRegistry.teams.capabilities).toEqual(["action_notification"]);
    expect(messagingChannelRegistry.telegram.capabilities).toEqual(["action_notification"]);
    expect(messagingChannelRegistry.whatsapp.capabilities).toEqual(["action_notification"]);
    expect(messagingChannelRegistry.whatsapp.ingestRequiresConsent).toBe(true);
  });

  it("formats source certification loss as a manager action", async () => {
    const { messageForOperationalEvent } = await import("@/lib/messaging/templates");

    expect(
      messageForOperationalEvent({
        type: "source_certification_lost",
        source: "Zendesk",
        workspaceName: "Demo",
        href: "https://app.example.com/admin/integrations/int-1"
      })
    ).toEqual({
      title: "Источник потерял live certification",
      body: "Zendesk требует проверки в Demo. Откройте источник и посмотрите evidence.",
      actionLabel: "Открыть источник",
      href: "https://app.example.com/admin/integrations/int-1"
    });
  });
});
