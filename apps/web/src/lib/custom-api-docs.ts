import { otrsFamilyTicketGetExample } from "@/lib/normalizers/otrs-family";
import type { CustomConversationInput } from "@/lib/validation/custom-api";

export const demoApiToken = "qa_demo_dev_token";

export const customApiEndpoints = [
  {
    method: "POST",
    path: "/api/conversations",
    scope: "conversations:write",
    purpose: "Создать или обновить диалог вместе с сообщениями."
  },
  {
    method: "POST",
    path: "/api/conversations/{id}/messages",
    scope: "conversations:write",
    purpose: "Добавить или обновить сообщение в уже импортированном диалоге."
  },
  {
    method: "POST",
    path: "/api/integrations/otrs-family/tickets",
    scope: "conversations:write",
    purpose: "Импортировать TicketGet-ответы OTRS CE 6, Znuny или OTOBO."
  },
  {
    method: "GET",
    path: "/api/reviews/export",
    scope: "reviews:read",
    purpose: "Выгрузить завершенные проверки и находки."
  }
] as const;

export const customConversationExample = {
  externalSource: "custom_api",
  externalId: "ticket-10042",
  externalUrl: "https://support.example.com/tickets/10042",
  channel: "ticket",
  subject: "Клиент просит возврат из-за задержки доставки",
  status: "closed",
  tags: ["возврат", "доставка", "vip"],
  customerName: "Анна Смирнова",
  assigneeName: "Иван Петров",
  samplingReason: "Высокий риск: политика возврата",
  riskHint: "Проверить корректность обещанного срока возврата",
  openedAt: "2026-04-25T10:00:00.000Z",
  closedAt: "2026-04-25T10:30:00.000Z",
  messages: [
    {
      externalId: "article-1",
      participantType: "customer",
      authorName: "Анна Смирнова",
      body: "Заказ задержан, хочу оформить возврат.",
      sentAt: "2026-04-25T10:00:00.000Z",
      isPrivate: false
    },
    {
      externalId: "article-2",
      participantType: "human_agent",
      authorName: "Иван Петров",
      body: "Проверю статус доставки и предложу доступные варианты по политике возврата.",
      sentAt: "2026-04-25T10:04:00.000Z",
      isPrivate: false
    }
  ]
} satisfies CustomConversationInput;

export const customMessageExample = {
  externalId: "article-3",
  participantType: "human_agent",
  authorName: "Иван Петров",
  body: "Обновление: перевозчик подтвердил задержку, возврат можно оформить сегодня.",
  sentAt: "2026-04-25T10:20:00.000Z",
  isPrivate: false
} as const;

export const otrsFamilyImportExample = {
  source: "znuny",
  baseUrl: "https://support.example.com/otrs",
  samplingReason: "Native OTRS-family импорт: очередь Refunds и статьи тикета.",
  ticketGet: otrsFamilyTicketGetExample
} as const;

export const customConversationSchemaRows = [
  { field: "externalSource", required: "Да", type: "string", note: "Код источника: custom_api, otrs, znuny, zendesk." },
  { field: "externalId", required: "Да", type: "string", note: "Стабильный ID диалога во внешней системе." },
  { field: "externalUrl", required: "Нет", type: "url", note: "Ссылка на тикет или диалог в источнике." },
  { field: "channel", required: "Да", type: "chat | email | ticket | messenger", note: "Канал общения." },
  { field: "subject", required: "Да", type: "string", note: "Тема диалога для очереди проверок." },
  { field: "status", required: "Да", type: "string", note: "Статус во внешней системе." },
  { field: "tags", required: "Нет", type: "string[]", note: "Метки для фильтрации и выборки." },
  { field: "customerName", required: "Да", type: "string", note: "Имя клиента." },
  { field: "assigneeName", required: "Нет", type: "string", note: "Оператор или группа поддержки." },
  { field: "samplingReason", required: "Да", type: "string", note: "Почему диалог попал в QA-очередь." },
  { field: "riskHint", required: "Нет", type: "string", note: "Подсказка для проверяющего." },
  { field: "openedAt", required: "Да", type: "ISO datetime", note: "Дата открытия с timezone offset." },
  { field: "closedAt", required: "Нет", type: "ISO datetime | null", note: "Дата закрытия, если есть." },
  { field: "messages", required: "Нет", type: "Message[]", note: "Сообщения можно импортировать сразу или отдельным endpoint." }
] as const;

export const customMessageSchemaRows = [
  { field: "externalId", required: "Да", type: "string", note: "Стабильный ID сообщения во внешней системе." },
  { field: "participantType", required: "Да", type: "customer | human_agent | ai_agent | system", note: "Тип автора." },
  { field: "authorName", required: "Да", type: "string", note: "Отображаемое имя автора." },
  { field: "body", required: "Да", type: "string", note: "Текст сообщения." },
  { field: "sentAt", required: "Да", type: "ISO datetime", note: "Дата отправки с timezone offset." },
  { field: "isPrivate", required: "Нет", type: "boolean", note: "Внутренняя заметка оператора." }
] as const;

export function formatJsonExample(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function buildCurlExample(path: string, method: string, body?: unknown) {
  const lines = [
    `curl -X ${method} "http://localhost:3000${path}"`,
    `  -H "Authorization: Bearer ${demoApiToken}"`,
    `  -H "Content-Type: application/json"`
  ];

  if (body) {
    lines.push(`  -d '${formatJsonExample(body)}'`);
  }

  return lines.join(" \\\n");
}
