import type { MessagingChannelDefinition } from "@/lib/messaging/types";

export const messagingChannelRegistry = {
  slack: {
    kind: "slack",
    displayName: "Slack",
    capabilities: ["action_notification"],
    ingestRequiresConsent: false,
    docsHref: "https://api.slack.com/"
  },
  teams: {
    kind: "teams",
    displayName: "Microsoft Teams",
    capabilities: ["action_notification"],
    ingestRequiresConsent: false,
    docsHref: "https://learn.microsoft.com/en-us/microsoftteams/platform/"
  },
  telegram: {
    kind: "telegram",
    displayName: "Telegram",
    capabilities: ["action_notification"],
    ingestRequiresConsent: true,
    docsHref: "https://core.telegram.org/bots/api"
  },
  whatsapp: {
    kind: "whatsapp",
    displayName: "WhatsApp Business",
    capabilities: ["action_notification"],
    ingestRequiresConsent: true,
    docsHref: "https://developers.facebook.com/docs/whatsapp/cloud-api/"
  }
} as const satisfies Record<string, MessagingChannelDefinition>;
