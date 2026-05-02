import type { CustomConversationInput, CustomMessageInput } from "@/lib/validation/custom-api";

type NativeScalar = string | number | boolean | null | undefined;
type NativeRecord = Record<string, unknown>;

export const nativeHelpdeskSources = [
  {
    value: "zendesk",
    label: "Zendesk",
    objectName: "Tickets + Comments",
    endpointHint: "/api/v2/tickets/{id}.json + /api/v2/tickets/{id}/comments.json"
  },
  {
    value: "intercom",
    label: "Intercom",
    objectName: "Conversations + Parts",
    endpointHint: "/conversations/{id}"
  },
  {
    value: "freshdesk",
    label: "Freshdesk",
    objectName: "Tickets + Conversations",
    endpointHint: "/api/v2/tickets/{id}?include=conversations"
  },
  {
    value: "hubspot",
    label: "HubSpot Service Hub",
    objectName: "Tickets + CRM activities",
    endpointHint: "/crm/v3/objects/tickets + associated activities"
  }
] as const;

export type NativeHelpdeskSource = (typeof nativeHelpdeskSources)[number]["value"];

export type NativeHelpdeskNormalizeOptions = {
  source: NativeHelpdeskSource;
  baseUrl?: string;
  samplingReason?: string;
};

const sourceLabels: Record<NativeHelpdeskSource, string> = {
  zendesk: "Zendesk",
  intercom: "Intercom",
  freshdesk: "Freshdesk",
  hubspot: "HubSpot"
};

const highRiskPattern = /(urgent|high|critical|escalat|vip|высок|критич|сроч)/i;

function isRecord(value: unknown): value is NativeRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown) {
  if (value === null || value === undefined) {
    return undefined;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : undefined;
}

function boolValue(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = stringValue(value)?.toLowerCase();

  if (!normalized) {
    return undefined;
  }

  if (["1", "true", "yes", "y"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "n"].includes(normalized)) {
    return false;
  }

  return undefined;
}

function recordValue(value: unknown): NativeRecord | undefined {
  return isRecord(value) ? value : undefined;
}

function arrayRecords(value: unknown): NativeRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord);
}

function oneOrManyRecords(value: unknown): NativeRecord[] {
  if (Array.isArray(value)) {
    return arrayRecords(value);
  }

  return isRecord(value) ? [value] : [];
}

function uniqueValues(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function scalarArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueValues(value.map(stringValue));
  }

  const normalized = stringValue(value);
  return normalized ? normalized.split(",").map((item) => item.trim()).filter(Boolean) : [];
}

function stripHtml(value: string | undefined) {
  return value
    ?.replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const normalized = stringValue(value);

    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

function parseDate(value: unknown, fallback = new Date(0)) {
  const normalized = stringValue(value);

  if (!normalized) {
    return fallback.toISOString();
  }

  if (/^\d+$/.test(normalized)) {
    const numericValue = Number(normalized);
    const milliseconds = normalized.length <= 10 ? numericValue * 1000 : numericValue;
    return new Date(milliseconds).toISOString();
  }

  const isoLikeValue = normalized.includes("T") ? normalized : normalized.replace(" ", "T");
  const withZone = /(Z|[+-]\d{2}:\d{2})$/.test(isoLikeValue) ? isoLikeValue : `${isoLikeValue}Z`;
  const date = new Date(withZone);

  return Number.isNaN(date.getTime()) ? fallback.toISOString() : date.toISOString();
}

function sourceUrl(baseUrl: string | undefined, path: string) {
  if (!baseUrl) {
    return undefined;
  }

  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

function recordsById(records: NativeRecord[]) {
  const byId = new Map<string, NativeRecord>();

  for (const record of records) {
    const id = firstString(record.id, record.user_id, record.contact_id);

    if (id) {
      byId.set(id, record);
    }
  }

  return byId;
}

function actorName(actor: NativeRecord | undefined, fallback: unknown) {
  return (
    firstString(actor?.name, actor?.email, actor?.display_name, actor?.full_name, actor?.id, fallback) ??
    "Неизвестный участник"
  );
}

function defaultSamplingReason(source: NativeHelpdeskSource) {
  return `Импорт ${sourceLabels[source]}: тикет/диалог и история сообщений.`;
}

function statusFromClosed(status: string | undefined, closedValues = ["closed", "solved", "resolved"]) {
  if (!status) {
    return null;
  }

  return closedValues.some((value) => status.toLowerCase().includes(value));
}

function zendeskChannel(ticket: NativeRecord): CustomConversationInput["channel"] {
  const via = recordValue(ticket.via);
  const channel = firstString(via?.channel, ticket.channel)?.toLowerCase() ?? "";

  if (channel.includes("chat")) {
    return "chat";
  }

  if (channel.includes("mail") || channel.includes("email")) {
    return "email";
  }

  if (channel.includes("messag") || boolValue(ticket.from_messaging_channel)) {
    return "messenger";
  }

  return "ticket";
}

function zendeskTicketUrl(baseUrl: string | undefined, ticketId: string) {
  return sourceUrl(baseUrl, `/agent/tickets/${encodeURIComponent(ticketId)}`);
}

function zendeskTickets(payload: unknown) {
  const root = recordValue(payload);

  if (!root) {
    return [];
  }

  return oneOrManyRecords(root.tickets).length > 0
    ? oneOrManyRecords(root.tickets)
    : oneOrManyRecords(root.ticket).length > 0
      ? oneOrManyRecords(root.ticket)
      : oneOrManyRecords(root);
}

function zendeskComments(root: NativeRecord, ticket: NativeRecord) {
  const ticketId = firstString(ticket.id, ticket.external_id);
  const commentsByTicket = recordValue(root.commentsByTicketId) ?? recordValue(root.comments_by_ticket_id);

  if (ticketId && commentsByTicket?.[ticketId]) {
    return oneOrManyRecords(commentsByTicket[ticketId]);
  }

  return oneOrManyRecords(ticket.comments).length > 0 ? oneOrManyRecords(ticket.comments) : oneOrManyRecords(root.comments);
}

function normalizeZendeskMessage(comment: NativeRecord, usersById: Map<string, NativeRecord>, index: number): CustomMessageInput {
  const authorId = firstString(comment.author_id, recordValue(comment.author)?.id);
  const author = recordValue(comment.author) ?? (authorId ? usersById.get(authorId) : undefined);
  const isPublic = boolValue(comment.public ?? comment.is_public) ?? true;
  const isStaff = boolValue(author?.is_staff ?? author?.is_agent ?? author?.agent);
  const body = firstString(comment.plain_body, comment.body, stripHtml(stringValue(comment.html_body)), comment.html_body);

  return {
    externalId: firstString(comment.id, `comment-${index + 1}`) ?? `comment-${index + 1}`,
    participantType: isStaff || !isPublic ? "human_agent" : "customer",
    authorName: actorName(author, authorId),
    body: stripHtml(body) ?? "Без текста",
    sentAt: parseDate(comment.created_at, new Date(index)),
    isPrivate: !isPublic
  };
}

function normalizeZendesk(payload: unknown, options: NativeHelpdeskNormalizeOptions): CustomConversationInput[] {
  const root = recordValue(payload) ?? {};
  const usersById = recordsById(arrayRecords(root.users).concat(arrayRecords(root.requesters), arrayRecords(root.agents)));

  return zendeskTickets(payload).map((ticket, ticketIndex) => {
    const ticketId = firstString(ticket.external_id, ticket.id) ?? `zendesk-ticket-${ticketIndex + 1}`;
    const comments = zendeskComments(root, ticket).map((comment, index) => normalizeZendeskMessage(comment, usersById, index));
    const description = stripHtml(firstString(ticket.description));
    const fallbackMessage: CustomMessageInput[] = description
      ? [
          {
            externalId: `${ticketId}:description`,
            participantType: "customer",
            authorName: actorName(usersById.get(firstString(ticket.requester_id) ?? ""), ticket.requester_id),
            body: description,
            sentAt: parseDate(ticket.created_at),
            isPrivate: false
          }
        ]
      : [];
    const messages = comments.length > 0 ? comments : fallbackMessage;
    const status = firstString(ticket.status) ?? "unknown";
    const priority = firstString(ticket.priority);

    return {
      externalSource: options.source,
      externalId: ticketId,
      externalUrl: firstString(ticket.url) ?? zendeskTicketUrl(options.baseUrl, ticketId),
      channel: zendeskChannel(ticket),
      subject: firstString(ticket.subject, ticket.raw_subject, ticket.title, `Zendesk ticket ${ticketId}`) ?? `Zendesk ticket ${ticketId}`,
      status,
      tags: uniqueValues([...scalarArray(ticket.tags), firstString(ticket.type), priority]),
      customerName: actorName(usersById.get(firstString(ticket.requester_id) ?? ""), ticket.requester_id),
      assigneeName: actorName(usersById.get(firstString(ticket.assignee_id) ?? ""), ticket.assignee_id),
      samplingReason: options.samplingReason ?? defaultSamplingReason(options.source),
      riskHint: priority && highRiskPattern.test(priority) ? `Priority: ${priority}` : undefined,
      openedAt: parseDate(ticket.created_at, messages[0] ? new Date(messages[0].sentAt) : new Date(0)),
      closedAt: statusFromClosed(status) ? parseDate(ticket.updated_at) : null,
      messages
    };
  });
}

function intercomConversationParts(conversation: NativeRecord) {
  const parts = recordValue(conversation.conversation_parts)?.conversation_parts ?? conversation.conversation_parts;
  return oneOrManyRecords(parts).concat(oneOrManyRecords(conversation.parts));
}

function intercomTags(conversation: NativeRecord) {
  const tags = recordValue(conversation.tags)?.tags ?? conversation.tags;
  return uniqueValues(oneOrManyRecords(tags).map((tag) => firstString(tag.name, tag.id)).concat(scalarArray(tags)));
}

function intercomContactName(conversation: NativeRecord) {
  const contacts = oneOrManyRecords(recordValue(conversation.contacts)?.contacts ?? conversation.contacts);
  const firstContact = contacts[0];

  return actorName(firstContact, firstString(firstContact?.email, firstContact?.id, conversation.user_id));
}

function intercomAuthorType(author: NativeRecord | undefined, partType?: string): CustomMessageInput["participantType"] {
  const type = firstString(author?.type, partType)?.toLowerCase() ?? "";

  if (type.includes("bot") || type.includes("fin")) {
    return "ai_agent";
  }

  if (type.includes("admin") || type.includes("team")) {
    return "human_agent";
  }

  if (type.includes("note") || type.includes("assignment")) {
    return "system";
  }

  return "customer";
}

function normalizeIntercomMessage(part: NativeRecord, index: number): CustomMessageInput {
  const author = recordValue(part.author) ?? recordValue(part.from);
  const partType = firstString(part.part_type, part.type);
  const isPrivate = partType?.toLowerCase().includes("note") ?? false;

  return {
    externalId: firstString(part.id, `part-${index + 1}`) ?? `part-${index + 1}`,
    participantType: intercomAuthorType(author, partType),
    authorName: actorName(author, firstString(author?.type, partType)),
    body: stripHtml(firstString(part.body, part.text, recordValue(part.message)?.body)) ?? "Без текста",
    sentAt: parseDate(part.created_at ?? part.updated_at, new Date(index)),
    isPrivate
  };
}

function normalizeIntercom(payload: unknown, options: NativeHelpdeskNormalizeOptions): CustomConversationInput[] {
  const root = recordValue(payload) ?? {};
  const conversations = oneOrManyRecords(root.conversations).length > 0
    ? oneOrManyRecords(root.conversations)
    : oneOrManyRecords(root.conversation).length > 0
      ? oneOrManyRecords(root.conversation)
      : oneOrManyRecords(root);

  return conversations.map((conversation, index) => {
    const conversationId = firstString(conversation.id, conversation.conversation_id) ?? `intercom-conversation-${index + 1}`;
    const source = recordValue(conversation.source);
    const sourceMessage = source?.body
      ? [
          normalizeIntercomMessage(
            {
              id: firstString(source.id, `${conversationId}:source`),
              body: source.body,
              author: source.author ?? source.from,
              created_at: source.created_at ?? conversation.created_at,
              part_type: "comment"
            },
            0
          )
        ]
      : [];
    const messages = sourceMessage.concat(intercomConversationParts(conversation).map((part, partIndex) => normalizeIntercomMessage(part, partIndex + 1)));
    const state = firstString(conversation.state, conversation.status) ?? (boolValue(conversation.open) ? "open" : "closed");
    const assignee = recordValue(conversation.assignee);

    return {
      externalSource: options.source,
      externalId: conversationId,
      externalUrl: sourceUrl(options.baseUrl, `/a/inbox/inbox/conversation/${encodeURIComponent(conversationId)}`),
      channel: "messenger",
      subject: firstString(conversation.title, source?.subject, messages[0]?.body.slice(0, 80), `Intercom ${conversationId}`) ?? `Intercom ${conversationId}`,
      status: state,
      tags: intercomTags(conversation),
      customerName: intercomContactName(conversation),
      assigneeName: firstString(assignee?.name, assignee?.email, conversation.admin_assignee_id, conversation.team_assignee_id),
      samplingReason: options.samplingReason ?? defaultSamplingReason(options.source),
      riskHint: intercomTags(conversation).some((tag) => highRiskPattern.test(tag)) ? "High-risk tag" : undefined,
      openedAt: parseDate(conversation.created_at, messages[0] ? new Date(messages[0].sentAt) : new Date(0)),
      closedAt: state.toLowerCase().includes("closed") ? parseDate(conversation.updated_at) : null,
      messages
    };
  });
}

const freshdeskStatuses: Record<string, string> = {
  "2": "open",
  "3": "pending",
  "4": "resolved",
  "5": "closed"
};

const freshdeskPriorities: Record<string, string> = {
  "1": "low",
  "2": "medium",
  "3": "high",
  "4": "urgent"
};

function freshdeskChannel(ticket: NativeRecord): CustomConversationInput["channel"] {
  const source = firstString(ticket.source)?.toLowerCase();

  if (source === "7" || source?.includes("chat")) {
    return "chat";
  }

  if (source === "1" || source === "10" || source?.includes("email")) {
    return "email";
  }

  return "ticket";
}

function normalizeFreshdeskMessage(conversation: NativeRecord, index: number): CustomMessageInput {
  const incoming = boolValue(conversation.incoming) ?? false;
  const isPrivate = boolValue(conversation.private) ?? false;

  return {
    externalId: firstString(conversation.id, `conversation-${index + 1}`) ?? `conversation-${index + 1}`,
    participantType: incoming ? "customer" : "human_agent",
    authorName: firstString(conversation.from_email, conversation.user_id, conversation.support_email) ?? (incoming ? "Клиент" : "Оператор"),
    body: stripHtml(firstString(conversation.body_text, conversation.body)) ?? "Без текста",
    sentAt: parseDate(conversation.created_at, new Date(index)),
    isPrivate
  };
}

function normalizeFreshdesk(payload: unknown, options: NativeHelpdeskNormalizeOptions): CustomConversationInput[] {
  const root = recordValue(payload) ?? {};
  const tickets = oneOrManyRecords(root.tickets).length > 0
    ? oneOrManyRecords(root.tickets)
    : oneOrManyRecords(root.ticket).length > 0
      ? oneOrManyRecords(root.ticket)
      : oneOrManyRecords(root);

  return tickets.map((ticket, ticketIndex) => {
    const ticketId = firstString(ticket.id) ?? `freshdesk-ticket-${ticketIndex + 1}`;
    const conversations = oneOrManyRecords(ticket.conversations).length > 0
      ? oneOrManyRecords(ticket.conversations)
      : oneOrManyRecords(root.conversations);
    const description = stripHtml(firstString(ticket.description_text, ticket.description));
    const messages = conversations.length > 0
      ? conversations.map(normalizeFreshdeskMessage)
      : description
        ? [
            {
              externalId: `${ticketId}:description`,
              participantType: "customer" as const,
              authorName: firstString(ticket.email, ticket.name, ticket.requester_id) ?? "Клиент",
              body: description,
              sentAt: parseDate(ticket.created_at),
              isPrivate: false
            }
          ]
        : [];
    const status = freshdeskStatuses[firstString(ticket.status) ?? ""] ?? firstString(ticket.status) ?? "unknown";
    const priority = freshdeskPriorities[firstString(ticket.priority) ?? ""] ?? firstString(ticket.priority);

    return {
      externalSource: options.source,
      externalId: ticketId,
      externalUrl: sourceUrl(options.baseUrl, `/a/tickets/${encodeURIComponent(ticketId)}`),
      channel: freshdeskChannel(ticket),
      subject: firstString(ticket.subject, `Freshdesk ticket ${ticketId}`) ?? `Freshdesk ticket ${ticketId}`,
      status,
      tags: uniqueValues([...scalarArray(ticket.tags), firstString(ticket.type), priority]),
      customerName: firstString(recordValue(ticket.requester)?.name, recordValue(ticket.requester)?.email, ticket.name, ticket.email, ticket.requester_id) ?? "Клиент",
      assigneeName: firstString(recordValue(ticket.responder)?.name, recordValue(ticket.responder)?.email, ticket.responder_id),
      samplingReason: options.samplingReason ?? defaultSamplingReason(options.source),
      riskHint: priority && highRiskPattern.test(priority) ? `Priority: ${priority}` : undefined,
      openedAt: parseDate(ticket.created_at, messages[0] ? new Date(messages[0].sentAt) : new Date(0)),
      closedAt: statusFromClosed(status, ["closed", "resolved"]) ? parseDate(ticket.updated_at) : null,
      messages
    };
  });
}

function hubspotProperties(ticket: NativeRecord) {
  return recordValue(ticket.properties) ?? ticket;
}

function hubspotActivities(root: NativeRecord, ticket: NativeRecord) {
  return [
    ...oneOrManyRecords(ticket.activities),
    ...oneOrManyRecords(ticket.messages),
    ...oneOrManyRecords(ticket.engagements),
    ...oneOrManyRecords(ticket.notes),
    ...oneOrManyRecords(ticket.emails),
    ...oneOrManyRecords(root.activities),
    ...oneOrManyRecords(root.messages),
    ...oneOrManyRecords(root.engagements)
  ];
}

function hubspotActivityBody(activity: NativeRecord) {
  const properties = recordValue(activity.properties) ?? {};
  const metadata = recordValue(activity.metadata) ?? {};

  return stripHtml(
    firstString(
      activity.body,
      activity.text,
      metadata.body,
      metadata.text,
      properties.hs_note_body,
      properties.hs_email_text,
      properties.hs_email_html,
      properties.hs_communication_body,
      properties.hs_task_body
    )
  );
}

function normalizeHubspotMessage(activity: NativeRecord, index: number): CustomMessageInput {
  const properties = recordValue(activity.properties) ?? {};
  const type = firstString(activity.type, activity.objectType, activity.object_type, properties.hs_object_source)?.toLowerCase() ?? "";
  const direction = firstString(activity.direction, properties.hs_email_direction, properties.hs_communication_channel_type)?.toLowerCase() ?? "";
  const isPrivate = type.includes("note") || stringValue(properties.hs_note_body) !== undefined;
  const isIncoming = direction.includes("incoming") || direction.includes("inbound");
  const isOutgoing = direction.includes("outgoing") || direction.includes("outbound");

  return {
    externalId: firstString(activity.id, properties.hs_object_id, `activity-${index + 1}`) ?? `activity-${index + 1}`,
    participantType: isIncoming ? "customer" : isOutgoing || isPrivate ? "human_agent" : "system",
    authorName:
      firstString(activity.authorName, activity.ownerName, activity.from, properties.hubspot_owner_id, properties.hs_created_by_user_id) ??
      (isIncoming ? "Клиент" : "HubSpot"),
    body: hubspotActivityBody(activity) ?? "Без текста",
    sentAt: parseDate(activity.createdAt ?? activity.created_at ?? activity.timestamp ?? properties.hs_timestamp, new Date(index)),
    isPrivate
  };
}

function normalizeHubspot(payload: unknown, options: NativeHelpdeskNormalizeOptions): CustomConversationInput[] {
  const root = recordValue(payload) ?? {};
  const tickets = oneOrManyRecords(root.results).length > 0
    ? oneOrManyRecords(root.results)
    : oneOrManyRecords(root.tickets).length > 0
      ? oneOrManyRecords(root.tickets)
      : oneOrManyRecords(root.ticket).length > 0
        ? oneOrManyRecords(root.ticket)
        : oneOrManyRecords(root);

  return tickets.map((ticket, index) => {
    const properties = hubspotProperties(ticket);
    const ticketId = firstString(ticket.id, properties.hs_object_id) ?? `hubspot-ticket-${index + 1}`;
    const messages = hubspotActivities(root, ticket)
      .map(normalizeHubspotMessage)
      .filter((message) => message.body !== "Без текста");
    const content = stripHtml(firstString(properties.content, properties.hs_ticket_description, properties.description));
    const fallbackMessages: CustomMessageInput[] = content
      ? [
          {
            externalId: `${ticketId}:content`,
            participantType: "customer",
            authorName: firstString(properties.customer_email, properties.contact_email, properties.associated_contact_id) ?? "Клиент",
            body: content,
            sentAt: parseDate(ticket.createdAt ?? properties.createdate),
            isPrivate: false
          }
        ]
      : [];
    const normalizedMessages = messages.length > 0 ? messages : fallbackMessages;
    const status = firstString(properties.hs_pipeline_stage, properties.hs_ticket_status, properties.status) ?? "unknown";
    const priority = firstString(properties.hs_ticket_priority, properties.priority);

    return {
      externalSource: options.source,
      externalId: ticketId,
      externalUrl: firstString(ticket.url, properties.hs_ticket_url),
      channel: messages.some((message) => message.externalId.toLowerCase().includes("email")) ? "email" : "ticket",
      subject: firstString(properties.subject, properties.hs_ticket_name, properties.name, `HubSpot ticket ${ticketId}`) ?? `HubSpot ticket ${ticketId}`,
      status,
      tags: uniqueValues([priority, firstString(properties.hs_ticket_category), firstString(properties.hs_pipeline), status]),
      customerName: firstString(properties.customer_name, properties.customer_email, properties.contact_email, properties.associated_contact_id) ?? "Клиент",
      assigneeName: firstString(properties.hubspot_owner_id, properties.hs_all_owner_ids),
      samplingReason: options.samplingReason ?? defaultSamplingReason(options.source),
      riskHint: priority && highRiskPattern.test(priority) ? `Priority: ${priority}` : undefined,
      openedAt: parseDate(ticket.createdAt ?? properties.createdate, normalizedMessages[0] ? new Date(normalizedMessages[0].sentAt) : new Date(0)),
      closedAt: statusFromClosed(status) ? parseDate(ticket.updatedAt ?? properties.hs_lastmodifieddate) : null,
      messages: normalizedMessages
    };
  });
}

export function normalizeNativeHelpdeskPayload(
  payload: unknown,
  options: NativeHelpdeskNormalizeOptions
): CustomConversationInput[] {
  const conversations =
    options.source === "zendesk"
      ? normalizeZendesk(payload, options)
      : options.source === "intercom"
        ? normalizeIntercom(payload, options)
        : options.source === "freshdesk"
          ? normalizeFreshdesk(payload, options)
          : normalizeHubspot(payload, options);

  return conversations.filter((conversation) => conversation.externalId && conversation.subject && conversation.messages.length > 0);
}

export function isNativeHelpdeskPayloadLike(payload: unknown, source: NativeHelpdeskSource) {
  return normalizeNativeHelpdeskPayload(payload, { source }).length > 0;
}

export const nativeHelpdeskMappingRows = [
  { source: "Zendesk ticket.id / external_id", target: "externalId", note: "Идемпотентный ключ диалога." },
  { source: "Zendesk comments[].plain_body/body/public/author_id", target: "messages[]", note: "Комментарии становятся сообщениями, private comments скрыты как внутренние." },
  { source: "Intercom conversation.id + source + conversation_parts", target: "conversation/messages", note: "Source становится первым сообщением, parts добавляются по created_at." },
  { source: "Freshdesk ticket.id + conversations[]", target: "conversation/messages", note: "incoming=true считается клиентом, private=true становится внутренней заметкой." },
  { source: "HubSpot ticket.properties + associated activities", target: "conversation/messages", note: "properties дают карточку тикета, activities/notes/emails дают историю." },
  { source: "priority/tags/status/stage", target: "tags/riskHint/status", note: "Высокий/urgent priority подсвечивается как риск." }
] as const;

export const nativeHelpdeskImportExamples: Record<NativeHelpdeskSource, unknown> = {
  zendesk: {
    ticket: {
      id: 35436,
      subject: "Refund request from Zendesk",
      status: "solved",
      priority: "high",
      tags: ["refund", "delivery"],
      requester_id: 20978392,
      assignee_id: 235323,
      created_at: "2026-04-25T10:00:00Z",
      updated_at: "2026-04-25T10:18:00Z",
      via: { channel: "email" }
    },
    users: [
      { id: 20978392, name: "Анна Смирнова", email: "anna@example.com", is_staff: false },
      { id: 235323, name: "Иван Петров", email: "ivan@example.com", is_staff: true }
    ],
    comments: [
      {
        id: 501,
        author_id: 20978392,
        plain_body: "Заказ задержан, хочу оформить возврат.",
        public: true,
        created_at: "2026-04-25T10:00:00Z"
      },
      {
        id: 502,
        author_id: 235323,
        plain_body: "Оформлю возврат после подтверждения перевозчика.",
        public: true,
        created_at: "2026-04-25T10:08:00Z"
      }
    ]
  },
  intercom: {
    conversation: {
      id: "conv_123",
      title: "Refund request from Intercom",
      state: "closed",
      created_at: 1777111200,
      updated_at: 1777112280,
      contacts: {
        contacts: [{ id: "contact_1", name: "Анна Смирнова", email: "anna@example.com" }]
      },
      assignee: { id: "admin_1", name: "Иван Петров" },
      tags: { tags: [{ id: "tag_1", name: "refund" }, { id: "tag_2", name: "vip" }] },
      source: {
        id: "source_1",
        body: "Заказ задержан, хочу возврат.",
        created_at: 1777111200,
        author: { type: "user", name: "Анна Смирнова" }
      },
      conversation_parts: {
        conversation_parts: [
          {
            id: "part_1",
            part_type: "comment",
            body: "Проверю статус и вернусь с вариантом возврата.",
            created_at: 1777111440,
            author: { type: "admin", name: "Иван Петров" }
          }
        ]
      }
    }
  },
  freshdesk: {
    ticket: {
      id: 20,
      subject: "Refund request from Freshdesk",
      status: 4,
      priority: 3,
      tags: ["refund", "delivery"],
      requester_id: 129,
      responder_id: 1,
      email: "anna@example.com",
      name: "Анна Смирнова",
      created_at: "2026-04-25T10:00:00Z",
      updated_at: "2026-04-25T10:18:00Z",
      conversations: [
        {
          id: 301,
          incoming: true,
          private: false,
          from_email: "anna@example.com",
          body_text: "Заказ задержан, хочу возврат.",
          created_at: "2026-04-25T10:00:00Z"
        },
        {
          id: 302,
          incoming: false,
          private: false,
          from_email: "ivan@example.com",
          body_text: "Проверю статус и предложу вариант возврата.",
          created_at: "2026-04-25T10:08:00Z"
        }
      ]
    }
  },
  hubspot: {
    ticket: {
      id: "987654321",
      createdAt: "2026-04-25T10:00:00.000Z",
      updatedAt: "2026-04-25T10:18:00.000Z",
      properties: {
        subject: "Refund request from HubSpot",
        hs_pipeline_stage: "closed",
        hs_ticket_priority: "HIGH",
        customer_email: "anna@example.com",
        hubspot_owner_id: "Ivan Petrov",
        content: "Заказ задержан, хочу возврат."
      },
      activities: [
        {
          id: "email_1",
          type: "EMAIL",
          direction: "INCOMING",
          body: "Заказ задержан, хочу возврат.",
          createdAt: "2026-04-25T10:00:00.000Z",
          authorName: "Анна Смирнова"
        },
        {
          id: "email_2",
          type: "EMAIL",
          direction: "OUTGOING",
          body: "Проверю статус и предложу вариант возврата.",
          createdAt: "2026-04-25T10:08:00.000Z",
          authorName: "Иван Петров"
        }
      ]
    }
  }
};
