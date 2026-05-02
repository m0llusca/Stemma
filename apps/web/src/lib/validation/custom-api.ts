import { z } from "zod";

export const customChannelSchema = z.enum(["chat", "email", "ticket", "messenger"]);

export const customParticipantTypeSchema = z.enum(["customer", "human_agent", "ai_agent", "system"]);

const optionalStringSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((value) => (value ? value : undefined));

export const customMessageSchema = z.object({
  externalId: z.string().trim().min(1),
  participantType: customParticipantTypeSchema,
  authorName: z.string().trim().min(1),
  body: z.string().trim().min(1),
  sentAt: z.string().datetime({ offset: true }),
  isPrivate: z.boolean().optional().default(false)
});

export const customConversationSchema = z.object({
  externalSource: z.string().trim().min(1),
  externalId: z.string().trim().min(1),
  externalUrl: optionalStringSchema,
  channel: customChannelSchema,
  subject: z.string().trim().min(1),
  status: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1)).optional().default([]),
  customerName: z.string().trim().min(1),
  assigneeName: optionalStringSchema,
  samplingReason: z.string().trim().min(1),
  riskHint: optionalStringSchema,
  openedAt: z.string().datetime({ offset: true }),
  closedAt: z.string().datetime({ offset: true }).optional().nullable(),
  messages: z.array(customMessageSchema).optional().default([])
});

export type CustomMessageInput = z.infer<typeof customMessageSchema>;
export type CustomConversationInput = z.infer<typeof customConversationSchema>;
