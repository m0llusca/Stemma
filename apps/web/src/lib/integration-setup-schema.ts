import { z } from "zod";

export const integrationSetupInputSchema = z.object({
  source: z.string().trim().min(1),
  sourceLabel: z.string().trim().min(1),
  mode: z.enum(["otrs_family", "native_helpdesk", "enterprise", "custom_api", "data_source"]),
  baseUrl: z.string().trim().nullable(),
  maxTickets: z.number().int().positive().max(10000),
  batchSize: z.number().int().positive().max(1000),
  dateRangeDays: z.number().int().positive().max(3650),
  ticketId: z.string().trim().optional().default(""),
  userLogin: z.string().trim().optional().default(""),
  dryRun: z.boolean(),
  deduplicate: z.boolean(),
  config: z.record(z.unknown()).default({})
});

export type IntegrationSetupInput = z.infer<typeof integrationSetupInputSchema>;

export const secretlessIntegrationSetupInputSchema = integrationSetupInputSchema.refine(
  (value) => value.mode === "custom_api",
  "tRPC queueImport supports only secretless custom API setup. Credentialed sources must use the server-action setup flow."
);
