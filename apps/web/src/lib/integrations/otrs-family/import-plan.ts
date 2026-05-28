import { prisma } from "@/lib/db";
import { upsertCustomConversation, type ImportedConversation } from "@/lib/conversation-import";
import { customConversationSchema, type CustomConversationInput } from "@/lib/validation/custom-api";
import type { OtrsHttpClient } from "@/lib/integrations/otrs-family/client";
import type { OtrsConnectorConfig } from "@/lib/integrations/otrs-family/config";
import { buildTicketGetRequest, buildTicketSearchRequest, parseTicketSearchResponse } from "@/lib/integrations/otrs-family/requests";
import { createOtrsSession, operationUsesSessionAuth } from "@/lib/integrations/otrs-family/session-auth";
import { normalizeOtrsFamilyTicketForImport } from "@/lib/integrations/otrs-family/normalization";
import {
  buildIntegrationSyncState,
  integrationRunCursorPayload,
  serializeIntegrationSyncState
} from "@/lib/integrations/sync-state";
import {
  extractOtrsFamilyTickets,
  isOtrsFamilyTicketLike,
  type OtrsFamilySource,
  type OtrsFamilyTicket,
  type OtrsFamilyTicketGetResponse
} from "@/lib/normalizers/otrs-family";

type JsonRecord = Record<string, unknown>;
type OtrsPreviewMode = "manual_ticket_ids" | "ticket_search";
type ConversationImportClient = {
  conversation: {
    upsert: (...args: any[]) => unknown;
  };
  message: {
    upsert: (...args: any[]) => unknown;
    deleteMany: (...args: any[]) => unknown;
  };
};

type PreviewDb = {
  integrationDiagnosticRun: {
    create(args: { data: JsonRecord }): Promise<JsonRecord>;
    update(args: { where: { id: string }; data: JsonRecord }): Promise<JsonRecord | null | undefined>;
  };
  integrationRun: {
    create(args: { data: JsonRecord }): Promise<JsonRecord>;
    update(args: { where: { id: string }; data: JsonRecord }): Promise<JsonRecord | null | undefined>;
  };
  integrationRunItem: {
    create(args: { data: JsonRecord }): Promise<JsonRecord>;
  };
  conversation: {
    findUnique(args: {
      where: {
        workspaceId_externalSource_externalId: {
          workspaceId: string;
          externalSource: string;
          externalId: string;
        };
      };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
};

type ImportDb = {
  integrationRun: {
    findFirst(args: { where: JsonRecord }): Promise<JsonRecord | null>;
    update(args: { where: { id: string }; data: JsonRecord }): Promise<JsonRecord | null | undefined>;
  };
  integrationRunItem: {
    updateMany(args: { where: JsonRecord; data: JsonRecord }): Promise<{ count: number }>;
    findMany(args: { where: JsonRecord; orderBy?: JsonRecord }): Promise<JsonRecord[]>;
    update(args: { where: { id: string }; data: JsonRecord }): Promise<JsonRecord | null | undefined>;
  };
  integration: {
    findFirst(args: { where: JsonRecord }): Promise<JsonRecord | null>;
    updateMany(args: { where: JsonRecord; data: JsonRecord }): Promise<{ count: number }>;
  };
} & ConversationImportClient;

type OtrsPreviewIntegration = {
  id: string;
  source: string;
  baseUrl: string | null;
  config: OtrsConnectorConfig;
};

type OtrsPreviewCommonInput = {
  db?: PreviewDb;
  client: Pick<OtrsHttpClient, "requestJson">;
  workspaceId: string;
  integration: OtrsPreviewIntegration;
  actorId?: string | null;
  userLogin: string;
  password: string;
};

type ManualTicketPreviewInput = {
  mode: "manual_ticket_ids";
  manualTicketIds: Array<string | number>;
};

type TicketSearchPreviewInput = {
  mode: "ticket_search";
  filters?: Record<string, unknown>;
};

export type CreateOtrsPreviewRunInput = OtrsPreviewCommonInput & (ManualTicketPreviewInput | TicketSearchPreviewInput);
export type CreateOtrsPreviewItemsInput = Omit<OtrsPreviewCommonInput, "actorId"> & {
  integrationRunId: string;
  diagnosticRunId: string;
} & (ManualTicketPreviewInput | TicketSearchPreviewInput);

export type ImportSelectedOtrsRunItemsInput = {
  db?: ImportDb;
  workspaceId: string;
  integrationId: string;
  integrationRunId: string;
  selectedItemIds: string[];
  importer?: (
    workspaceId: string,
    payload: CustomConversationInput,
    client: ConversationImportClient
  ) => Promise<ImportedConversation>;
};

export async function createOtrsPreviewRun(input: CreateOtrsPreviewRunInput) {
  const db = input.db ?? prisma;
  const requestedLimit = requestedPreviewLimit(input);
  const diagnosticRun = await db.integrationDiagnosticRun.create({
    data: {
      workspaceId: input.workspaceId,
      integrationId: input.integration.id,
      actorId: input.actorId ?? null,
      status: "running",
      mode: input.mode
    }
  });
  const run = await db.integrationRun.create({
    data: {
      workspaceId: input.workspaceId,
      integrationId: input.integration.id,
      actorId: input.actorId ?? null,
      source: input.integration.source,
      mode: input.mode,
      status: "previewed",
      dryRun: true,
      requestedLimit,
      checkedCount: 0,
      importedCount: 0,
      skippedCount: 0,
      errorCount: 0
    }
  });
  let items: JsonRecord[];

  try {
    items = await createOtrsPreviewItems({
      db,
      client: input.client,
      workspaceId: input.workspaceId,
      integrationRunId: String(run.id),
      diagnosticRunId: String(diagnosticRun.id),
      integration: input.integration,
      userLogin: input.userLogin,
      password: input.password,
      ...(input.mode === "manual_ticket_ids"
        ? { mode: input.mode, manualTicketIds: input.manualTicketIds }
        : { mode: input.mode, filters: input.filters })
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Не удалось создать preview интеграции.";
    const finishedAt = new Date();

    await db.integrationRun.update({
      where: { id: String(run.id) },
      data: {
        status: "failed",
        checkedCount: 0,
        importedCount: 0,
        skippedCount: 0,
        errorCount: 1,
        errorMessage,
        finishedAt
      }
    });
    await db.integrationDiagnosticRun.update({
      where: { id: String(diagnosticRun.id) },
      data: {
        status: "failed",
        errorMessage,
        finishedAt,
        summaryJson: JSON.stringify({
          error: errorMessage
        })
      }
    });

    throw error;
  }
  const progress = previewRunProgress(items);
  const updatedRun = await db.integrationRun.update({
    where: { id: String(run.id) },
    data: progress
  });
  const status = items.some((item) => item.status !== "previewed") ? "warning" : "succeeded";

  await db.integrationDiagnosticRun.update({
    where: { id: String(diagnosticRun.id) },
    data: {
      status,
      finishedAt: new Date(),
      summaryJson: JSON.stringify({
        previewedCount: items.filter((item) => item.status === "previewed").length,
        skippedCount: items.filter((item) => item.status === "skipped").length
      })
    }
  });

  return {
    diagnosticRun: {
      ...diagnosticRun,
      status
    },
    run: updatedRun ?? {
      ...run,
      ...progress
    },
    items
  };
}

export async function createOtrsPreviewItems(input: CreateOtrsPreviewItemsInput) {
  const db = input.db ?? prisma;
  const sessionId = await previewSessionId(input);
  const ticketIds = await previewTicketIds(input, sessionId);
  const items: JsonRecord[] = [];

  for (const ticketId of ticketIds) {
    items.push(await createPreviewItemForTicketId({ ...input, db, ticketId, sessionId }));
  }

  return items;
}

export async function importSelectedOtrsRunItems(input: ImportSelectedOtrsRunItemsInput) {
  const db = input.db ?? prisma;
  const importer =
    input.importer ??
    ((workspaceId: string, payload: CustomConversationInput, client: ConversationImportClient) =>
      upsertCustomConversation(workspaceId, payload, client as NonNullable<Parameters<typeof upsertCustomConversation>[2]>));
  const run = await db.integrationRun.findFirst({
    where: {
      id: input.integrationRunId,
      workspaceId: input.workspaceId,
      integrationId: input.integrationId
    }
  });

  if (!run) {
    throw new Error("Integration preview run was not found in the requested workspace.");
  }
  const integration = await db.integration.findFirst({
    where: {
      id: input.integrationId,
      workspaceId: input.workspaceId
    }
  });

  if (!integration) {
    throw new Error("Интеграция не найдена.");
  }

  if (integration.status === "disabled") {
    throw new Error("Интеграция отключена.");
  }

  await db.integrationRunItem.updateMany({
    where: {
      workspaceId: input.workspaceId,
      integrationRunId: input.integrationRunId,
      id: {
        in: input.selectedItemIds
      },
      status: "previewed"
    },
    data: {
      status: "selected"
    }
  });

  const selectedItems = await db.integrationRunItem.findMany({
    where: {
      workspaceId: input.workspaceId,
      integrationRunId: input.integrationRunId,
      id: {
        in: input.selectedItemIds
      },
      status: "selected"
    },
    orderBy: {
      createdAt: "asc"
    }
  });
  let importedCount = 0;
  let errorCount = 0;
  let lastSuccessfulExternalId: string | undefined;

  if (selectedItems.length === 0) {
    const finishedAt = new Date();

    await db.integrationRun.update({
      where: { id: input.integrationRunId },
      data: {
        status: "no_selection",
        dryRun: true,
        checkedCount: 0,
        importedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        errorMessage: "No preview items were selected for import.",
        finishedAt
      }
    });

    await updateEnabledIntegration(db, input, {
      status: "ready",
      lastError: null
    });

    return {
      importedCount: 0,
      errorCount: 0
    };
  }

  for (const item of selectedItems) {
    try {
      const conversation = parsePreviewConversation(item.normalizedPreviewJson);
      const imported = await importer(input.workspaceId, conversation, db);

      importedCount += 1;
      lastSuccessfulExternalId = imported.externalId || conversation.externalId;
      await db.integrationRunItem.update({
        where: { id: String(item.id) },
        data: {
          conversationId: imported.id,
          status: "imported",
          warningsJson: normalizedJsonArray(item.warningsJson),
          errorsJson: "[]"
        }
      });
    } catch (error) {
      errorCount += 1;
      await db.integrationRunItem.update({
        where: { id: String(item.id) },
        data: {
          status: "failed",
          errorsJson: JSON.stringify([
            ...parseJsonArray(item.errorsJson),
            {
              code: "import_failed",
              message: safeImportErrorMessage(error)
            }
          ])
        }
      });
    }
  }

  const finishedAt = new Date();
  const status = importedCount > 0 ? "imported" : "failed";
  const errorMessage = importedCount > 0 ? null : "All selected preview items failed to import.";
  const integrationStatus = importedCount > 0 ? "active" : "error";
  const checkedCount = selectedItems.length;
  const syncState = buildIntegrationSyncState({
    source: String(run.source ?? "otrs"),
    mode: String(run.mode ?? "otrs_selected_import"),
    cursor: lastSuccessfulExternalId ?? null,
    checkedCount,
    importedCount,
    skippedCount: 0,
    errorCount,
    checkpoint: {
      integrationRunId: input.integrationRunId,
      selectedItemIds: input.selectedItemIds,
      lastSuccessfulExternalId: lastSuccessfulExternalId ?? null
    },
    updatedAt: finishedAt
  });

  await db.integrationRun.update({
    where: { id: input.integrationRunId },
    data: {
      status,
      dryRun: false,
      checkedCount,
      importedCount,
      skippedCount: 0,
      errorCount,
      cursorJson: JSON.stringify(integrationRunCursorPayload(syncState)),
      checkpointJson: JSON.stringify(syncState.checkpoint),
      errorMessage,
      finishedAt
    }
  });

  if (lastSuccessfulExternalId) {
    await updateEnabledIntegration(db, input, {
      status: integrationStatus,
      lastError: null,
      lastImportAt: finishedAt,
      lastSyncedAt: finishedAt,
      syncCursor: lastSuccessfulExternalId,
      syncStateJson: serializeIntegrationSyncState(syncState)
    });
  } else {
    await updateEnabledIntegration(db, input, {
      status: integrationStatus,
      lastError: errorMessage
    });
  }

  return {
    importedCount,
    errorCount
  };
}

async function updateEnabledIntegration(
  db: ImportDb,
  input: Pick<ImportSelectedOtrsRunItemsInput, "workspaceId" | "integrationId">,
  data: JsonRecord
) {
  const result = await db.integration.updateMany({
    where: {
      id: input.integrationId,
      workspaceId: input.workspaceId,
      status: { not: "disabled" }
    },
    data
  });

  if (result.count !== 1) {
    throw new Error("Интеграция отключена.");
  }
}

async function previewSessionId(input: CreateOtrsPreviewItemsInput) {
  const config = input.integration.config;
  const needsTicketSearchSession = input.mode === "ticket_search" && operationUsesSessionAuth(config, "ticketSearch");
  const needsTicketGetSession = operationUsesSessionAuth(config, "ticketGet");

  if (!needsTicketSearchSession && !needsTicketGetSession) {
    return undefined;
  }

  return createOtrsSession({
    client: input.client,
    config,
    baseUrl: input.integration.baseUrl ?? undefined,
    userLogin: input.userLogin,
    password: input.password
  });
}

async function previewTicketIds(input: CreateOtrsPreviewItemsInput, sessionId?: string) {
  if (input.mode === "manual_ticket_ids") {
    return uniqueTicketIds(input.manualTicketIds).slice(0, input.integration.config.limits.manualTicketIdLimit);
  }

  const response = await input.client.requestJson(
    buildTicketSearchRequest({
      config: input.integration.config,
      baseUrl: input.integration.baseUrl ?? undefined,
      userLogin: input.userLogin,
      password: input.password,
      sessionId,
      filters: input.filters,
      limit: input.integration.config.limits.searchLimit
    })
  );

  return uniqueTicketIds(parseTicketSearchResponse(response)).slice(0, input.integration.config.limits.searchLimit);
}

function uniqueTicketIds(ticketIds: Array<string | number>) {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const rawTicketId of ticketIds) {
    const ticketId = String(rawTicketId).trim();

    if (!ticketId || seen.has(ticketId)) {
      continue;
    }

    seen.add(ticketId);
    unique.push(ticketId);
  }

  return unique;
}

function previewRunProgress(items: JsonRecord[]) {
  return {
    checkedCount: items.length,
    importedCount: 0,
    skippedCount: items.filter((item) => item.status === "skipped").length,
    errorCount: items.filter((item) => parseJsonArray(item.errorsJson).length > 0).length
  };
}

async function createPreviewItemForTicketId(input: CreateOtrsPreviewItemsInput & { db: PreviewDb; ticketId: string; sessionId?: string }) {
  try {
    const ticketPayload = await input.client.requestJson(
      buildTicketGetRequest({
        config: input.integration.config,
        baseUrl: input.integration.baseUrl ?? undefined,
        userLogin: input.userLogin,
        password: input.password,
        sessionId: operationUsesSessionAuth(input.integration.config, "ticketGet") ? input.sessionId : undefined,
        ticketId: input.ticketId,
        allArticles: true,
        includeAttachments: true
      })
    );
    const ticket = firstTicket(ticketPayload);

    if (!ticket) {
      return createSkippedPreviewItem(input, input.ticketId, [
        {
          code: "ticket_not_found",
          message: `Ticket ${input.ticketId} was not returned by OTRS TicketGet.`
        }
      ]);
    }

    const normalized = normalizeOtrsFamilyTicketForImport(ticket, {
      source: input.integration.source as OtrsFamilySource,
      baseUrl: input.integration.baseUrl ?? undefined
    });
    const conversation = customConversationSchema.parse(normalized.conversation);
    const duplicate = await input.db.conversation.findUnique({
      where: {
        workspaceId_externalSource_externalId: {
          workspaceId: input.workspaceId,
          externalSource: conversation.externalSource,
          externalId: conversation.externalId
        }
      },
      select: {
        id: true
      }
    });
    const warnings = duplicate
      ? [
          ...normalized.warnings,
          {
            code: "duplicate_conversation",
            message: "Conversation already exists in this workspace and will be skipped during selected import.",
            detail: {
              conversationId: duplicate.id,
              externalSource: conversation.externalSource,
              externalId: conversation.externalId
            }
          }
        ]
      : normalized.warnings;

    return input.db.integrationRunItem.create({
      data: {
        workspaceId: input.workspaceId,
        integrationRunId: input.integrationRunId,
        diagnosticRunId: input.diagnosticRunId,
        externalId: conversation.externalId,
        ticketNumber: stringValue(ticket.TicketNumber),
        status: duplicate ? "skipped" : "previewed",
        articleCount: normalized.stats.articleCount,
        privateArticleCount: normalized.stats.privateArticleCount,
        attachmentCount: normalized.stats.attachmentCount,
        warningsJson: JSON.stringify(warnings),
        errorsJson: "[]",
        normalizedPreviewJson: JSON.stringify(conversation)
      }
    });
  } catch {
    return createSkippedPreviewItem(input, input.ticketId, [
      {
        code: "ticket_get_failed",
        message: `TicketGet failed for TicketID ${input.ticketId}.`
      }
    ]);
  }
}

function createSkippedPreviewItem(
  input: CreateOtrsPreviewItemsInput & { db: PreviewDb; ticketId: string },
  externalId: string,
  errors: Array<{ code: string; message: string; detail?: Record<string, unknown> }>
) {
  return input.db.integrationRunItem.create({
    data: {
      workspaceId: input.workspaceId,
      integrationRunId: input.integrationRunId,
      diagnosticRunId: input.diagnosticRunId,
      externalId,
      status: "skipped",
      articleCount: 0,
      privateArticleCount: 0,
      attachmentCount: 0,
      warningsJson: "[]",
      errorsJson: JSON.stringify(errors),
      normalizedPreviewJson: "{}"
    }
  });
}

function firstTicket(payload: unknown): OtrsFamilyTicket | undefined {
  const tickets = extractOtrsFamilyTickets(payload as OtrsFamilyTicketGetResponse | OtrsFamilyTicket);

  return tickets.find(isOtrsFamilyTicketLike);
}

function requestedPreviewLimit(input: CreateOtrsPreviewRunInput) {
  if (input.mode === "manual_ticket_ids") {
    return Math.min(uniqueTicketIds(input.manualTicketIds).length, input.integration.config.limits.manualTicketIdLimit);
  }

  return input.integration.config.limits.searchLimit;
}

function parsePreviewConversation(value: unknown) {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;

  return customConversationSchema.parse(parsed);
}

function parseJsonArray(value: unknown): unknown[] {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizedJsonArray(value: unknown) {
  return JSON.stringify(parseJsonArray(value));
}

function safeImportErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Import failed for this preview item.";
}

function stringValue(value: unknown) {
  if (value === null || value === undefined) {
    return undefined;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : undefined;
}
