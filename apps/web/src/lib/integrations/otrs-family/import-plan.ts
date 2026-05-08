import { prisma } from "@/lib/db";
import { upsertCustomConversation, type ImportedConversation } from "@/lib/conversation-import";
import { customConversationSchema, type CustomConversationInput } from "@/lib/validation/custom-api";
import type { OtrsHttpClient } from "@/lib/integrations/otrs-family/client";
import type { OtrsConnectorConfig } from "@/lib/integrations/otrs-family/config";
import { buildTicketGetRequest, buildTicketSearchRequest, parseTicketSearchResponse } from "@/lib/integrations/otrs-family/requests";
import { normalizeOtrsFamilyTicketForImport } from "@/lib/integrations/otrs-family/normalization";
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
  };
};

type PreviewDb = {
  integrationDiagnosticRun: {
    create(args: { data: JsonRecord }): Promise<JsonRecord>;
    update(args: { where: { id: string }; data: JsonRecord }): Promise<JsonRecord | null | undefined>;
  };
  integrationRun: {
    create(args: { data: JsonRecord }): Promise<JsonRecord>;
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
    update(args: { where: { id: string }; data: JsonRecord }): Promise<JsonRecord | null | undefined>;
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
      importedCount: 0,
      errorCount: 0
    }
  });
  const items = await createOtrsPreviewItems({
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
    run,
    items
  };
}

export async function createOtrsPreviewItems(input: CreateOtrsPreviewItemsInput) {
  const db = input.db ?? prisma;
  const ticketIds = await previewTicketIds(input);
  const items: JsonRecord[] = [];

  for (const ticketId of ticketIds) {
    items.push(await createPreviewItemForTicketId({ ...input, db, ticketId }));
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
        importedCount: 0,
        errorCount: 0,
        errorMessage: "No preview items were selected for import.",
        finishedAt
      }
    });

    await db.integration.update({
      where: { id: input.integrationId },
      data: {
        status: "ready",
        lastError: null
      }
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

  await db.integrationRun.update({
    where: { id: input.integrationRunId },
    data: {
      status,
      dryRun: false,
      importedCount,
      errorCount,
      errorMessage,
      finishedAt
    }
  });

  if (lastSuccessfulExternalId) {
    await db.integration.update({
      where: { id: input.integrationId },
      data: {
        status: integrationStatus,
        lastError: null,
        lastImportAt: finishedAt,
        lastSyncedAt: finishedAt,
        syncCursor: lastSuccessfulExternalId
      }
    });
  } else {
    await db.integration.update({
      where: { id: input.integrationId },
      data: {
        status: integrationStatus,
        lastError: errorMessage
      }
    });
  }

  return {
    importedCount,
    errorCount
  };
}

async function previewTicketIds(input: CreateOtrsPreviewItemsInput) {
  if (input.mode === "manual_ticket_ids") {
    return input.manualTicketIds.map(String).filter(Boolean).slice(0, input.integration.config.limits.manualTicketIdLimit);
  }

  const response = await input.client.requestJson(
    buildTicketSearchRequest({
      config: input.integration.config,
      baseUrl: input.integration.baseUrl ?? undefined,
      userLogin: input.userLogin,
      password: input.password,
      filters: input.filters,
      limit: input.integration.config.limits.searchLimit
    })
  );

  return parseTicketSearchResponse(response).slice(0, input.integration.config.limits.searchLimit);
}

async function createPreviewItemForTicketId(input: CreateOtrsPreviewItemsInput & { db: PreviewDb; ticketId: string }) {
  try {
    const ticketPayload = await input.client.requestJson(
      buildTicketGetRequest({
        config: input.integration.config,
        baseUrl: input.integration.baseUrl ?? undefined,
        userLogin: input.userLogin,
        password: input.password,
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
    return Math.min(input.manualTicketIds.length, input.integration.config.limits.manualTicketIdLimit);
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
