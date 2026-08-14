import { z } from "zod";

export const customConversationLimits = {
  maxMessagesPerConversation: 300,
  maxConversationsPerImportRequest: 100,
  maxExternalIdLength: 255,
  maxSubjectLength: 500,
  maxMessageBodyLength: 100_000
} as const;

export const customChannelSchema = z.enum(["chat", "email", "ticket", "messenger"]);

export const customParticipantTypeSchema = z.enum(["customer", "human_agent", "ai_agent", "system"]);
export const customSamplingTypeSchema = z.enum(["random", "dsat", "lead_signal", "new_hire", "low_score", "manual"]);

const optionalStringSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((value) => (value ? value : undefined));

const optionalUrlSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().url().optional()
);

export const customMessageSchema = z.object({
  externalId: z.string().trim().min(1).max(customConversationLimits.maxExternalIdLength),
  participantType: customParticipantTypeSchema,
  authorName: z.string().trim().min(1),
  body: z.string().trim().min(1).max(customConversationLimits.maxMessageBodyLength),
  sentAt: z.string().datetime({ offset: true }),
  isPrivate: z.boolean().optional().default(false)
});

export const customConversationSchema = z.object({
  externalSource: z.string().trim().min(1),
  externalId: z.string().trim().min(1).max(customConversationLimits.maxExternalIdLength),
  externalUrl: optionalUrlSchema,
  channel: customChannelSchema,
  subject: z.string().trim().min(1).max(customConversationLimits.maxSubjectLength),
  status: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1)).optional().default([]),
  customerName: z.string().trim().min(1),
  assigneeName: optionalStringSchema,
  samplingReason: z.string().trim().min(1),
  samplingType: customSamplingTypeSchema.optional(),
  csatScore: z.number().int().min(1).max(5).optional().nullable(),
  supportLine: optionalStringSchema,
  teamName: optionalStringSchema,
  riskHint: optionalStringSchema,
  openedAt: z.string().datetime({ offset: true }),
  closedAt: z.string().datetime({ offset: true }).optional().nullable(),
  messages: z.array(customMessageSchema).max(customConversationLimits.maxMessagesPerConversation).optional().default([])
});

export type CustomMessageInput = z.infer<typeof customMessageSchema>;
export type CustomConversationInput = z.infer<typeof customConversationSchema>;
