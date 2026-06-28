export type MessagingChannelKind = "slack" | "teams" | "telegram" | "whatsapp";
export type MessagingCapability = "action_notification" | "conversation_ingest";

export type MessagingChannelDefinition = {
  kind: MessagingChannelKind;
  displayName: string;
  capabilities: MessagingCapability[];
  ingestRequiresConsent: boolean;
  docsHref: string;
};

export type OperationalMessagingEvent =
  | { type: "source_certification_lost"; source: string; workspaceName: string; href: string }
  | { type: "training_overdue"; assigneeName: string; count: number; href: string }
  | { type: "queue_without_start"; count: number; href: string }
  | { type: "risk_spike"; riskCount: number; href: string };

export type MessageTemplate = {
  title: string;
  body: string;
  actionLabel: string;
  href: string;
};
