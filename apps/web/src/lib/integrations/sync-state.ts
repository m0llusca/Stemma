import { z } from "zod";

const syncProgressSchema = z.object({
  checkedCount: z.number().int().nonnegative().default(0),
  importedCount: z.number().int().nonnegative().default(0),
  skippedCount: z.number().int().nonnegative().default(0),
  errorCount: z.number().int().nonnegative().default(0)
});

const integrationSyncStateSchema = z.object({
  version: z.literal(1).default(1),
  source: z.string().default("unknown"),
  mode: z.string().default("unknown"),
  cursor: z.string().nullable().default(null),
  cursorKind: z.string().default("external_id"),
  checkpoint: z.record(z.unknown()).default({}),
  progress: syncProgressSchema.default({
    checkedCount: 0,
    importedCount: 0,
    skippedCount: 0,
    errorCount: 0
  }),
  updatedAt: z.string().datetime().nullable().default(null)
});

export type IntegrationSyncState = z.infer<typeof integrationSyncStateSchema>;

export function parseIntegrationSyncState(value: string | null | undefined): IntegrationSyncState {
  if (!value) {
    return integrationSyncStateSchema.parse({});
  }

  try {
    return integrationSyncStateSchema.parse(JSON.parse(value));
  } catch {
    return integrationSyncStateSchema.parse({});
  }
}

export function buildIntegrationSyncState(input: {
  source: string;
  mode: string;
  cursor?: string | null;
  cursorKind?: string;
  checkedCount?: number;
  importedCount?: number;
  skippedCount?: number;
  errorCount?: number;
  checkpoint?: Record<string, unknown>;
  updatedAt?: Date;
}): IntegrationSyncState {
  return integrationSyncStateSchema.parse({
    version: 1,
    source: input.source,
    mode: input.mode,
    cursor: input.cursor ?? null,
    cursorKind: input.cursorKind ?? "external_id",
    checkpoint: input.checkpoint ?? {},
    progress: {
      checkedCount: input.checkedCount ?? 0,
      importedCount: input.importedCount ?? 0,
      skippedCount: input.skippedCount ?? 0,
      errorCount: input.errorCount ?? 0
    },
    updatedAt: (input.updatedAt ?? new Date()).toISOString()
  });
}

export function serializeIntegrationSyncState(state: IntegrationSyncState) {
  return JSON.stringify(integrationSyncStateSchema.parse(state));
}

export function integrationRunCursorPayload(state: IntegrationSyncState) {
  return {
    cursor: state.cursor,
    cursorKind: state.cursorKind
  };
}
