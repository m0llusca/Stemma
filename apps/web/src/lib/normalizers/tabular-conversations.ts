import { z } from "zod";
import {
  customConversationSchema,
  customParticipantTypeSchema,
  type CustomConversationInput
} from "@/lib/validation/custom-api";

const booleanLikeSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase();

  if (["true", "1", "yes"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no"].includes(normalized)) {
    return false;
  }

  return value;
}, z.boolean());

const tabularRowSchema = z.object({
  conversation_id: z.string().trim().min(1),
  message_id: z.string().trim().min(1),
  author_name: z.string().trim().min(1),
  participant_type: customParticipantTypeSchema,
  body: z.string().trim().min(1),
  sent_at: z.string().datetime({ offset: true }),
  subject: z.string().trim().min(1).optional(),
  status: z.string().trim().min(1).optional(),
  channel: z.enum(["chat", "email", "ticket", "messenger"]).optional(),
  customer_name: z.string().trim().min(1).optional(),
  assignee_name: z.string().trim().min(1).optional(),
  external_url: z.string().trim().url().optional(),
  tags: z.union([z.array(z.string().trim().min(1)), z.string()]).optional(),
  is_private: booleanLikeSchema.optional(),
  opened_at: z.string().datetime({ offset: true }).optional(),
  closed_at: z.string().datetime({ offset: true }).optional().nullable(),
  sampling_reason: z.string().trim().min(1).optional(),
  risk_hint: z.string().trim().min(1).optional()
});

export type TabularConversationRow = z.infer<typeof tabularRowSchema>;

type NormalizeOptions = {
  source: string;
  samplingReason: string;
};

export function normalizeTabularConversationRows(rows: unknown[], options: NormalizeOptions): CustomConversationInput[] {
  const parsedRows = rows.map((row) => {
    const parsed = tabularRowSchema.safeParse(row);

    if (!parsed.success) {
      throw new Error("Строка табличного источника не содержит обязательные поля.");
    }

    return parsed.data;
  });
  const groups = new Map<string, TabularConversationRow[]>();

  for (const row of parsedRows) {
    groups.set(row.conversation_id, [...(groups.get(row.conversation_id) ?? []), row]);
  }

  return Array.from(groups.entries()).map(([conversationId, groupRows]) => {
    const sortedRows = [...groupRows].sort((left, right) => left.sent_at.localeCompare(right.sent_at));
    const tags = normalizeTags(firstValue(groupRows, "tags"));
    const fallbackSubject = sortedRows[0]?.body.slice(0, 80) || `Conversation ${conversationId}`;

    return customConversationSchema.parse({
      externalSource: options.source,
      externalId: conversationId,
      externalUrl: firstValue(groupRows, "external_url"),
      channel: firstValue(groupRows, "channel") ?? "ticket",
      subject: firstValue(groupRows, "subject") ?? fallbackSubject,
      status: firstValue(groupRows, "status") ?? "imported",
      tags,
      customerName:
        firstValue(groupRows, "customer_name") ??
        sortedRows.find((row) => row.participant_type === "customer")?.author_name ??
        sortedRows[0]!.author_name,
      assigneeName: firstValue(groupRows, "assignee_name"),
      samplingReason: firstValue(groupRows, "sampling_reason") ?? options.samplingReason,
      riskHint: firstValue(groupRows, "risk_hint"),
      openedAt: firstValue(groupRows, "opened_at") ?? sortedRows[0]!.sent_at,
      closedAt: firstValue(groupRows, "closed_at") ?? null,
      messages: sortedRows.map((row) => ({
        externalId: row.message_id,
        participantType: row.participant_type,
        authorName: row.author_name,
        body: row.body,
        sentAt: row.sent_at,
        isPrivate: row.is_private ?? false
      }))
    });
  });
}

function firstValue<Key extends keyof TabularConversationRow>(rows: TabularConversationRow[], key: Key) {
  return rows.find((row) => row[key] !== undefined && row[key] !== null)?.[key];
}

function normalizeTags(value: TabularConversationRow["tags"]) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  return value
    .split(/[;,]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}
