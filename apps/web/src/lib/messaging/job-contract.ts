/**
 * Fixed contract for the MESSAGING_DELIVERY background job — the seam between
 * the business-event emitters (which enqueue, inside their own transaction) and
 * the delivery worker (which loads the workspace's active channels, records a
 * MessagingDelivery row, and POSTs to each channel's webhook).
 *
 * The emitter builds the Russian message context at the event site (it has the
 * review/agent/conversation data); the worker sends it verbatim. Keep this
 * module dependency-light and pure.
 */

export const MESSAGING_EVENT_TYPES = [
  "review.finalized",
  "training.assigned",
  "appeal.opened",
  "quota.at_risk"
] as const;

export type MessagingEventType = (typeof MESSAGING_EVENT_TYPES)[number];

export type MessagingRecipientType = "reviewer" | "manager" | "admin" | "assignee";

/** Human-facing message content, prebuilt by the emitter. */
export type MessagingMessageContext = {
  title: string;
  body: string;
  /** Optional deep link (e.g. /reviews/<id>) shown as the action. */
  href?: string;
};

/** Payload carried by a MESSAGING_DELIVERY BackendJob. */
export type MessagingDeliveryJobPayload = {
  eventType: MessagingEventType;
  recipientType: MessagingRecipientType;
  recipientRef?: string;
  context: MessagingMessageContext;
};

export function isMessagingEventType(value: unknown): value is MessagingEventType {
  return typeof value === "string" && (MESSAGING_EVENT_TYPES as readonly string[]).includes(value);
}

/**
 * Defensive parse of a BackendJob.payloadJson into a MessagingDeliveryJobPayload.
 * Returns null when the shape is unusable so the worker fails the job cleanly
 * rather than throwing on malformed input.
 */
export function parseMessagingDeliveryJobPayload(raw: unknown): MessagingDeliveryJobPayload | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;

  if (!isMessagingEventType(record.eventType)) {
    return null;
  }

  const context = record.context;
  if (!context || typeof context !== "object") {
    return null;
  }

  const contextRecord = context as Record<string, unknown>;
  const title = typeof contextRecord.title === "string" ? contextRecord.title : "";
  const body = typeof contextRecord.body === "string" ? contextRecord.body : "";

  if (!title) {
    return null;
  }

  const recipientType = record.recipientType;
  const allowedRecipients: MessagingRecipientType[] = ["reviewer", "manager", "admin", "assignee"];
  const resolvedRecipient = allowedRecipients.includes(recipientType as MessagingRecipientType)
    ? (recipientType as MessagingRecipientType)
    : "manager";

  return {
    eventType: record.eventType,
    recipientType: resolvedRecipient,
    recipientRef: typeof record.recipientRef === "string" ? record.recipientRef : undefined,
    context: {
      title,
      body,
      href: typeof contextRecord.href === "string" ? contextRecord.href : undefined
    }
  };
}
