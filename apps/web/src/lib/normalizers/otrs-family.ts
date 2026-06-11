import type { CustomConversationInput, CustomMessageInput } from "@/lib/validation/custom-api";
import {
  otrsFamilyApiProfiles,
  otrsFamilyProfileForSource,
  otrsFamilySourceOptions,
  type OtrsFamilyApiProfile,
  type OtrsFamilySource
} from "@/lib/integrations/otrs-family/profiles";

export { otrsFamilyApiProfiles, otrsFamilyProfileForSource, otrsFamilySourceOptions };
export type { OtrsFamilyApiProfile, OtrsFamilySource };

type OtrsScalar = string | number | boolean | null | undefined;
type OtrsRequestValue = string | number | boolean | Array<string | number | boolean>;
type OtrsFamilyTicketGetRequestOptions = {
  userLogin?: string;
  password?: string;
  ticketId?: string;
  includeAttachments?: boolean;
  wrapped?: boolean;
};
type OtrsFamilyTicketGetFlatRequest = Record<
  | "UserLogin"
  | "Password"
  | "TicketID"
  | "Extended"
  | "AllArticles"
  | "ArticleOrder"
  | "DynamicFields"
  | "Attachments"
  | "GetAttachmentContents",
  string | number
>;

function normalizeBaseUrl(value: string | undefined, profile: OtrsFamilyApiProfile) {
  return (value?.trim() || profile.exampleBaseUrl).replace(/\/$/, "");
}

export function otrsFamilyRestBaseUrl(profile: OtrsFamilyApiProfile, baseUrl?: string) {
  return `${normalizeBaseUrl(baseUrl, profile)}/nph-genericinterface.pl/Webservice/${profile.webService}`;
}

function pathWithTicketId(path: string, ticketId: string) {
  return path.replace("{TicketID}", encodeURIComponent(ticketId));
}

export function otrsFamilyTicketGetUrl(profile: OtrsFamilyApiProfile, ticketId = "42", baseUrl?: string) {
  return `${otrsFamilyRestBaseUrl(profile, baseUrl)}${pathWithTicketId(profile.ticketGetPath, ticketId)}`;
}

export function otrsFamilyTicketSearchUrl(profile: OtrsFamilyApiProfile, baseUrl?: string) {
  return `${otrsFamilyRestBaseUrl(profile, baseUrl)}${profile.ticketSearchPath}`;
}

export function otrsFamilyUrlWithQuery(url: string, params: Record<string, OtrsRequestValue | undefined>) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }

    const values = Array.isArray(value) ? value : [value];

    values.forEach((item) => query.append(key, String(item)));
  });

  const queryString = query.toString();

  if (!queryString) {
    return url;
  }

  return `${url}${url.includes("?") ? "&" : "?"}${queryString}`;
}

function buildOtrsFamilyTicketGetFlatRequest({
  userLogin = "qa_api",
  password = "<PASSWORD>",
  ticketId = "42",
  includeAttachments = false
}: OtrsFamilyTicketGetRequestOptions = {}): OtrsFamilyTicketGetFlatRequest {
  return {
    UserLogin: userLogin,
    Password: password,
    TicketID: ticketId,
    Extended: 1,
    AllArticles: 1,
    ArticleOrder: "ASC",
    DynamicFields: 1,
    Attachments: includeAttachments ? 1 : 0,
    GetAttachmentContents: 0
  };
}

export function buildOtrsFamilyTicketGetRequest(
  options?: OtrsFamilyTicketGetRequestOptions & { wrapped?: false }
): OtrsFamilyTicketGetFlatRequest;
export function buildOtrsFamilyTicketGetRequest(
  options: OtrsFamilyTicketGetRequestOptions & { wrapped: true }
): { TicketGet: OtrsFamilyTicketGetFlatRequest };
export function buildOtrsFamilyTicketGetRequest(
  options: OtrsFamilyTicketGetRequestOptions
): OtrsFamilyTicketGetFlatRequest | { TicketGet: OtrsFamilyTicketGetFlatRequest };
export function buildOtrsFamilyTicketGetRequest(options: OtrsFamilyTicketGetRequestOptions = {}) {
  const request = buildOtrsFamilyTicketGetFlatRequest(options);

  return options.wrapped ? { TicketGet: request } : request;
}

export function buildOtrsFamilyTicketGetQueryParams(
  profile: OtrsFamilyApiProfile,
  options: OtrsFamilyTicketGetRequestOptions = {}
) {
  const request = buildOtrsFamilyTicketGetFlatRequest(options);

  if (profile.ticketGetPath.includes("{TicketID}")) {
    const params: Partial<OtrsFamilyTicketGetFlatRequest> = { ...request };
    delete params.TicketID;

    return params;
  }

  return request;
}

export function buildOtrsFamilyTicketSearchRequest({
  userLogin = "qa_api",
  password = "<PASSWORD>",
  queue = "Support::Refunds",
  title = "%refund%"
}: {
  userLogin?: string;
  password?: string;
  queue?: string;
  title?: string;
} = {}) {
  return {
    UserLogin: userLogin,
    // OTRS TicketSearch accepts `Queues` (array) / `QueueIDs`; the singular
    // `Queue` is silently ignored by the operation.
    Password: password,
    Queues: [queue],
    Title: title,
    StateType: ["open", "closed"],
    Limit: 50
  };
}

export const otrsFamilyRequestShapeNotes = [
  {
    title: "GET по умолчанию",
    detail: "Для стандартного GenericTicketConnectorREST TicketGet чаще вызывается GET-запросом: TicketID идет в route или query, auth и флаги в query."
  },
  {
    title: "Запасной JSON-запрос",
    detail: "POST/PATCH с JSON-body нужен только для нестандартной маршрутизации; поля обычно идут в корне JSON без обертки TicketGet."
  },
  {
    title: "JSON с оберткой",
    detail: "Форму { TicketGet: { ... } } используйте только если ваш gateway или входящее сопоставление явно ожидает обертку операции."
  },
  {
    title: "Маршрут TicketGet",
    detail: "URL зависит от Admin -> Web Services: у OTRS/Znuny часто /Ticket/{TicketID}, у OTOBO часто /TicketGet?TicketID=..."
  },
  {
    title: "Attachments",
    detail: "Для проверки по умолчанию Attachments=0 и GetAttachmentContents=0, чтобы не тащить тяжелый base64."
  }
] as const;

export type OtrsFamilyArticle = {
  ArticleID?: OtrsScalar;
  ArticleNumber?: OtrsScalar;
  SenderType?: OtrsScalar;
  SenderTypeID?: OtrsScalar;
  From?: OtrsScalar;
  Subject?: OtrsScalar;
  Body?: OtrsScalar;
  Text?: OtrsScalar;
  Created?: OtrsScalar;
  CreateTime?: OtrsScalar;
  IncomingTime?: OtrsScalar;
  IsVisibleForCustomer?: OtrsScalar;
  CommunicationChannel?: OtrsScalar;
  ChannelName?: OtrsScalar;
  ArticleType?: OtrsScalar;
  ContentType?: OtrsScalar;
  MimeType?: OtrsScalar;
};

export type OtrsFamilyTicket = {
  TicketID?: OtrsScalar;
  TicketNumber?: OtrsScalar;
  Title?: OtrsScalar;
  State?: OtrsScalar;
  StateType?: OtrsScalar;
  Queue?: OtrsScalar;
  Priority?: OtrsScalar;
  Type?: OtrsScalar;
  Service?: OtrsScalar;
  SLA?: OtrsScalar;
  CustomerID?: OtrsScalar;
  CustomerUserID?: OtrsScalar;
  CustomerUser?: OtrsScalar;
  Owner?: OtrsScalar;
  Responsible?: OtrsScalar;
  Created?: OtrsScalar;
  CreateTime?: OtrsScalar;
  Changed?: OtrsScalar;
  Closed?: OtrsScalar;
  ClosedTime?: OtrsScalar;
  Article?: OtrsFamilyArticle | OtrsFamilyArticle[];
};

export type OtrsFamilyTicketGetResponse = {
  Success?: OtrsScalar;
  Ticket?: OtrsFamilyTicket | OtrsFamilyTicket[];
};

export type OtrsFamilyNormalizeOptions = {
  source?: OtrsFamilySource;
  baseUrl?: string;
  samplingReason?: string;
  timeZone?: string;
};

const highRiskPriorityPattern = /(high|critical|urgent|escalat|высок|критич|сроч)/i;

function stringValue(value: OtrsScalar) {
  if (value === null || value === undefined) {
    return undefined;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : undefined;
}

function arrayValue<T>(value: T | T[] | undefined) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function zoneOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const parts: Record<string, number> = {};
  for (const part of dtf.formatToParts(instant)) {
    if (part.type !== "literal") {
      parts[part.type] = Number(part.value);
    }
  }
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - instant.getTime();
}

export function naiveOtrsDateToUtcIso(naive: string, timeZone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(naive);
  if (!match) {
    const fallback = new Date(`${naive}Z`);
    return Number.isNaN(fallback.getTime()) ? new Date(0).toISOString() : fallback.toISOString();
  }
  const [, y, mo, d, h, mi, s] = match.map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  // Two passes converge the zone offset for DST transitions; for fixed-offset
  // zones (e.g. Europe/Moscow) the first pass is already exact.
  let utc = guess - zoneOffsetMs(new Date(guess), timeZone);
  utc = guess - zoneOffsetMs(new Date(utc), timeZone);
  return new Date(utc).toISOString();
}

export function parseOtrsDate(value: OtrsScalar, fallback = new Date(0), timeZone = "UTC") {
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

  if (/(Z|[+-]\d{2}:\d{2})$/.test(isoLikeValue)) {
    const date = new Date(isoLikeValue);
    return Number.isNaN(date.getTime()) ? fallback.toISOString() : date.toISOString();
  }

  const iso = naiveOtrsDateToUtcIso(isoLikeValue, timeZone);
  return Number.isNaN(Date.parse(iso)) ? fallback.toISOString() : iso;
}

function isVisibleForCustomer(value: OtrsScalar) {
  const normalized = stringValue(value)?.toLowerCase();

  if (normalized === undefined) {
    return true;
  }

  return !["0", "false", "n", "no"].includes(normalized);
}

function participantType(article: OtrsFamilyArticle): CustomMessageInput["participantType"] {
  const senderType = stringValue(article.SenderType)?.toLowerCase() ?? "";

  if (senderType.includes("customer") || senderType.includes("external")) {
    return "customer";
  }

  if (senderType.includes("agent")) {
    return "human_agent";
  }

  if (senderType.includes("system") || senderType.includes("auto")) {
    return "system";
  }

  return isVisibleForCustomer(article.IsVisibleForCustomer) ? "customer" : "human_agent";
}

function articleChannel(article: OtrsFamilyArticle) {
  return [
    stringValue(article.CommunicationChannel),
    stringValue(article.ChannelName),
    stringValue(article.ArticleType),
    stringValue(article.ContentType),
    stringValue(article.MimeType)
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function conversationChannel(articles: OtrsFamilyArticle[]): CustomConversationInput["channel"] {
  const channelText = articles.map(articleChannel).join(" ");

  if (channelText.includes("chat")) {
    return "chat";
  }

  if (channelText.includes("mail") || channelText.includes("email")) {
    return "email";
  }

  if (channelText.includes("sms") || channelText.includes("messenger") || channelText.includes("telegram")) {
    return "messenger";
  }

  return "ticket";
}

function ticketUrl(baseUrl: string | undefined, ticketId: string | undefined) {
  if (!baseUrl || !ticketId) {
    return undefined;
  }

  return `${baseUrl.replace(/\/$/, "")}/index.pl?Action=AgentTicketZoom;TicketID=${encodeURIComponent(ticketId)}`;
}

function uniqueTags(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

export function extractOtrsFamilyTickets(payload: OtrsFamilyTicketGetResponse | OtrsFamilyTicket): OtrsFamilyTicket[] {
  const response = payload as OtrsFamilyTicketGetResponse;

  if (response.Ticket !== undefined) {
    return arrayValue(response.Ticket);
  }

  return [payload as OtrsFamilyTicket];
}

export function isOtrsFamilyTicketLike(ticket: OtrsFamilyTicket) {
  return Boolean(
    stringValue(ticket.TicketID) ??
      stringValue(ticket.TicketNumber) ??
      stringValue(ticket.Title) ??
      stringValue(ticket.CustomerID) ??
      stringValue(ticket.CustomerUserID) ??
      ticket.Article
  );
}

export function normalizeOtrsFamilyArticle(article: OtrsFamilyArticle, index = 0, timeZone = "UTC"): CustomMessageInput {
  const externalId =
    stringValue(article.ArticleID) ?? stringValue(article.ArticleNumber) ?? `article-${String(index + 1).padStart(3, "0")}`;
  const sentAt = parseOtrsDate(article.Created ?? article.CreateTime ?? article.IncomingTime, new Date(index), timeZone);
  const senderType = participantType(article);

  return {
    externalId,
    participantType: senderType,
    authorName: stringValue(article.From) ?? stringValue(article.SenderType) ?? "OTRS",
    body: stringValue(article.Body) ?? stringValue(article.Text) ?? stringValue(article.Subject) ?? "Без текста",
    sentAt,
    isPrivate: !isVisibleForCustomer(article.IsVisibleForCustomer)
  };
}

export function normalizeOtrsFamilyTicket(
  ticket: OtrsFamilyTicket,
  options: OtrsFamilyNormalizeOptions = {}
): CustomConversationInput {
  const timeZone = options.timeZone ?? "UTC";
  const articles = arrayValue(ticket.Article).sort((left, right) => {
    const leftTime = new Date(parseOtrsDate(left.Created ?? left.CreateTime ?? left.IncomingTime, new Date(0), timeZone)).getTime();
    const rightTime = new Date(parseOtrsDate(right.Created ?? right.CreateTime ?? right.IncomingTime, new Date(0), timeZone)).getTime();
    return leftTime - rightTime;
  });
  const messages = articles.map((article, index) => normalizeOtrsFamilyArticle(article, index, timeZone));
  const ticketId = stringValue(ticket.TicketID);
  const ticketNumber = stringValue(ticket.TicketNumber);
  const priority = stringValue(ticket.Priority);
  const createdAt = parseOtrsDate(ticket.Created ?? ticket.CreateTime, messages[0] ? new Date(messages[0].sentAt) : new Date(0), timeZone);
  const closedAt = ticket.Closed || ticket.ClosedTime ? parseOtrsDate(ticket.Closed ?? ticket.ClosedTime, new Date(0), timeZone) : null;
  const firstCustomerMessage = messages.find((message) => message.participantType === "customer");

  return {
    externalSource: options.source ?? "otrs_family",
    externalId: ticketId ?? ticketNumber ?? "unknown-ticket",
    externalUrl: ticketUrl(options.baseUrl, ticketId),
    channel: conversationChannel(articles),
    subject: stringValue(ticket.Title) ?? stringValue(articles[0]?.Subject) ?? `Ticket ${ticketNumber ?? ticketId ?? ""}`.trim(),
    status: stringValue(ticket.State) ?? stringValue(ticket.StateType) ?? "unknown",
    tags: uniqueTags([
      stringValue(ticket.Queue),
      priority,
      stringValue(ticket.Type),
      stringValue(ticket.Service),
      stringValue(ticket.SLA)
    ]),
    customerName:
      stringValue(ticket.CustomerUserID) ??
      stringValue(ticket.CustomerUser) ??
      stringValue(ticket.CustomerID) ??
      firstCustomerMessage?.authorName ??
      "Неизвестный клиент",
    assigneeName: stringValue(ticket.Owner) ?? stringValue(ticket.Responsible),
    samplingReason: options.samplingReason ?? "Импорт OTRS-family: тикет и статьи через GenericInterface TicketGet.",
    riskHint: priority && highRiskPriorityPattern.test(priority) ? `Приоритет: ${priority}` : undefined,
    openedAt: createdAt,
    closedAt,
    messages
  };
}

export function normalizeOtrsFamilyTicketGetResponse(
  payload: OtrsFamilyTicketGetResponse,
  options: OtrsFamilyNormalizeOptions = {}
): CustomConversationInput[] {
  return extractOtrsFamilyTickets(payload).map((ticket) => normalizeOtrsFamilyTicket(ticket, options));
}

export const otrsFamilyMappingRows = [
  { source: "TicketID / TicketNumber", target: "externalId", note: "Стабильный ID для идемпотентного импорта." },
  { source: "Title", target: "subject", note: "Тема в очереди проверок." },
  { source: "State / StateType", target: "status", note: "Исходный статус тикета сохраняется строкой." },
  { source: "Queue, Priority, Type, Service, SLA", target: "tags", note: "Используются для фильтрации и выборки." },
  { source: "CustomerUserID / CustomerID", target: "customerName", note: "Клиент в карточке диалога." },
  { source: "Owner / Responsible", target: "assigneeName", note: "Ответственный оператор или группа." },
  { source: "Article[].ArticleID", target: "messages[].externalId", note: "Стабильный ID статьи." },
  { source: "Article[].SenderType", target: "messages[].participantType", note: "customer, agent, system -> участники диалога." },
  { source: "Article[].IsVisibleForCustomer", target: "messages[].isPrivate", note: "Невидимые клиенту статьи становятся приватными." }
] as const;

export const otrsFamilyTicketGetExample = {
  Success: 1,
  Ticket: {
    TicketID: "42",
    TicketNumber: "20260502000042",
    Title: "Клиент просит возврат после задержки доставки",
    State: "closed successful",
    Queue: "Support::Refunds",
    Priority: "3 normal",
    Type: "Incident",
    Service: "Delivery",
    CustomerID: "customer-1001",
    CustomerUserID: "mila@example.com",
    Owner: "Иван Петров",
    Created: "2026-04-25 10:00:00",
    Closed: "2026-04-25 10:18:00",
    Article: [
      {
        ArticleID: "101",
        SenderType: "customer",
        From: "Мила Петрова <mila@example.com>",
        Subject: "Доставка задерживается",
        Body: "Доставка задерживается, я хочу возврат.",
        Created: "2026-04-25 10:00:00",
        IsVisibleForCustomer: 1,
        CommunicationChannel: "Email"
      },
      {
        ArticleID: "102",
        SenderType: "agent",
        From: "Иван Петров",
        Body: "Помогу разобраться. Можем предложить бонусный кредит или оформить возврат после подтверждения перевозчика.",
        Created: "2026-04-25 10:04:00",
        IsVisibleForCustomer: 1,
        CommunicationChannel: "Email"
      }
    ]
  }
} satisfies OtrsFamilyTicketGetResponse;
