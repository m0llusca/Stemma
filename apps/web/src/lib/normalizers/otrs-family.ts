import type { CustomConversationInput, CustomMessageInput } from "@/lib/validation/custom-api";

type OtrsScalar = string | number | boolean | null | undefined;

export type OtrsFamilySource = "otrs" | "znuny" | "otobo" | "otrs_family";

export const otrsFamilySourceOptions = [
  { value: "znuny", label: "Znuny" },
  { value: "otrs", label: "OTRS CE 6" },
  { value: "otobo", label: "OTOBO" },
  { value: "otrs_family", label: "OTRS-family fallback" }
] as const satisfies ReadonlyArray<{ value: OtrsFamilySource; label: string }>;

export const otrsFamilyApiProfiles = [
  {
    source: "otrs",
    label: "OTRS Community Edition 6",
    shortLabel: "OTRS CE 6",
    basePath: "/otrs",
    exampleBaseUrl: "https://support.example.com/otrs",
    webService: "GenericTicketConnectorREST",
    auth: "UserLogin + Password или SessionID",
    ticketZoomPath: "/index.pl?Action=AgentTicketZoom;TicketID=<TicketID>",
    docsUrl: "https://otrscommunityedition.com/doc/manual/admin/6.0/en/html/genericinterface.html",
    note: "Обычно используется импортированный GenericTicketConnectorREST; route может отличаться, если Web Service переименован."
  },
  {
    source: "znuny",
    label: "Znuny LTS",
    shortLabel: "Znuny",
    basePath: "/znuny",
    exampleBaseUrl: "https://support.example.com/znuny",
    webService: "GenericTicketConnectorREST",
    auth: "UserLogin + Password или SessionID",
    ticketZoomPath: "/index.pl?Action=AgentTicketZoom;TicketID=<TicketID>",
    docsUrl: "https://doc.znuny.org/znuny/admin/webservices/examples/GenericTicketConnectorREST/index.html",
    note: "В актуальной документации Znuny примеры GenericTicketConnectorREST используют base path /znuny."
  },
  {
    source: "otobo",
    label: "OTOBO",
    shortLabel: "OTOBO",
    basePath: "/otobo",
    exampleBaseUrl: "https://support.example.com/otobo",
    webService: "GenericTicketConnectorREST",
    auth: "UserLogin + Password или SessionID",
    ticketZoomPath: "/index.pl?Action=AgentTicketZoom;TicketID=<TicketID>",
    docsUrl: "https://otobo-docs.softoft.de/en/administration/automation/rest-api",
    note: "OTOBO сохраняет GenericInterface-подход; проверьте route в Admin -> Web Services после импорта конфигурации."
  }
] as const satisfies ReadonlyArray<{
  source: Exclude<OtrsFamilySource, "otrs_family">;
  label: string;
  shortLabel: string;
  basePath: string;
  exampleBaseUrl: string;
  webService: string;
  auth: string;
  ticketZoomPath: string;
  docsUrl: string;
  note: string;
}>;

export type OtrsFamilyApiProfile = (typeof otrsFamilyApiProfiles)[number];

const genericOtrsFamilyProfile: OtrsFamilyApiProfile = otrsFamilyApiProfiles[1];

export function otrsFamilyProfileForSource(source: OtrsFamilySource): OtrsFamilyApiProfile {
  return otrsFamilyApiProfiles.find((profile) => profile.source === source) ?? genericOtrsFamilyProfile;
}

function normalizeBaseUrl(value: string | undefined, profile: OtrsFamilyApiProfile) {
  return (value?.trim() || profile.exampleBaseUrl).replace(/\/$/, "");
}

export function otrsFamilyRestBaseUrl(profile: OtrsFamilyApiProfile, baseUrl?: string) {
  return `${normalizeBaseUrl(baseUrl, profile)}/nph-genericinterface.pl/Webservice/${profile.webService}`;
}

export function otrsFamilyTicketGetUrl(profile: OtrsFamilyApiProfile, ticketId = "42", baseUrl?: string) {
  return `${otrsFamilyRestBaseUrl(profile, baseUrl)}/Ticket/${encodeURIComponent(ticketId)}`;
}

export function otrsFamilyTicketSearchUrl(profile: OtrsFamilyApiProfile, baseUrl?: string) {
  return `${otrsFamilyRestBaseUrl(profile, baseUrl)}/Ticket/search`;
}

export function buildOtrsFamilyTicketGetRequest({
  userLogin = "qa_api",
  password = "<PASSWORD>",
  ticketId = "42",
  includeAttachments = false
}: {
  userLogin?: string;
  password?: string;
  ticketId?: string;
  includeAttachments?: boolean;
} = {}) {
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
    Password: password,
    Queue: queue,
    Title: title,
    StateType: ["open", "closed"],
    Limit: 50
  };
}

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

function parseOtrsDate(value: OtrsScalar, fallback = new Date(0)) {
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

export function normalizeOtrsFamilyArticle(article: OtrsFamilyArticle, index = 0): CustomMessageInput {
  const externalId =
    stringValue(article.ArticleID) ?? stringValue(article.ArticleNumber) ?? `article-${String(index + 1).padStart(3, "0")}`;
  const sentAt = parseOtrsDate(article.Created ?? article.CreateTime ?? article.IncomingTime, new Date(index));
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
  const articles = arrayValue(ticket.Article).sort((left, right) => {
    const leftTime = new Date(parseOtrsDate(left.Created ?? left.CreateTime ?? left.IncomingTime)).getTime();
    const rightTime = new Date(parseOtrsDate(right.Created ?? right.CreateTime ?? right.IncomingTime)).getTime();
    return leftTime - rightTime;
  });
  const messages = articles.map(normalizeOtrsFamilyArticle);
  const ticketId = stringValue(ticket.TicketID);
  const ticketNumber = stringValue(ticket.TicketNumber);
  const priority = stringValue(ticket.Priority);
  const createdAt = parseOtrsDate(ticket.Created ?? ticket.CreateTime, messages[0] ? new Date(messages[0].sentAt) : new Date(0));
  const closedAt = ticket.Closed || ticket.ClosedTime ? parseOtrsDate(ticket.Closed ?? ticket.ClosedTime) : null;
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
