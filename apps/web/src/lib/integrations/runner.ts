import type { Integration, IntegrationCredential, Prisma } from "@prisma/client";
import { upsertCustomConversation, type ImportedConversation } from "@/lib/conversation-import";
import { prisma } from "@/lib/db";
import { assertIntegrationSourceContractSupported } from "@/lib/integration-import-service";
import { importSelectedOtrsRunItems } from "@/lib/integrations/otrs-family/import-plan";
import {
  buildOtrsFamilyTicketGetQueryParams,
  extractOtrsFamilyTickets,
  isOtrsFamilyTicketLike,
  normalizeOtrsFamilyTicket,
  otrsFamilyProfileForSource,
  otrsFamilyTicketGetUrl,
  otrsFamilyUrlWithQuery,
  type OtrsFamilySource,
  type OtrsFamilyTicketGetResponse
} from "@/lib/normalizers/otrs-family";
import { loadHelpdeskAdapterConversations } from "@/lib/integrations/helpdesk-adapters/service";
import { decryptIntegrationSecretSlot } from "@/lib/integrations/otrs-family/credentials";
import {
  buildIntegrationSyncState,
  integrationRunCursorPayload,
  serializeIntegrationSyncState
} from "@/lib/integrations/sync-state";
import { customConversationSchema, type CustomConversationInput } from "@/lib/validation/custom-api";

type IntegrationWithCredential = Integration & {
  credentials: IntegrationCredential[];
};
type IntegrationRunItemClient = Pick<Prisma.TransactionClient, "integrationRunItem">;

type IntegrationConfig = {
  source?: string;
  sourceLabel?: string;
  mode?: string;
  ticketId?: string;
  userLogin?: string;
  filters?: {
    queue?: string;
    status?: string;
  };
  dryRun?: boolean;
  deduplicate?: boolean;
};

export type IntegrationRunResult = {
  source: string;
  mode: string;
  dryRun: boolean;
  importedCount: number;
  checkedCount: number;
  externalIds: string[];
};

export type SelectedOtrsImportRunResult = {
  operation: "otrs_selected_import";
  importedCount: number;
  errorCount: number;
};

type ConnectorWriteGuard = (db: Prisma.TransactionClient) => Promise<void>;

function parseConfig(value: string): IntegrationConfig {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as IntegrationConfig) : {};
  } catch {
    return {};
  }
}

function requireText(value: string | null | undefined, message: string) {
  const normalized = value?.trim();

  if (!normalized) {
    throw new Error(message);
  }

  return normalized;
}

function assertIntegrationEnabled(integration: Pick<Integration, "status">) {
  if (integration.status === "disabled") {
    throw new Error("Интеграция отключена.");
  }
}

function optionalCredentialSecret(credentials: IntegrationCredential[]) {
  return decryptIntegrationSecretSlot(credentials, "auth_password");
}

function requestedLimit(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 10000) : fallback;
}

async function fetchJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init.headers ?? {})
    },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    throw new Error(`Источник вернул HTTP ${response.status}: ${response.statusText || "Ошибка upstream-источника."}`);
  }

  const text = await response.text();

  try {
    return text ? (JSON.parse(text) as unknown) : {};
  } catch {
    throw new Error("Источник вернул ответ не в JSON-формате.");
  }
}

function bearerHeaders(token: string | undefined): Record<string, string> {
  return token
    ? {
        authorization: `Bearer ${token}`
      }
    : {};
}

function externalSourceUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

function parseCustomApiPayload(payload: unknown, source: string) {
  const body = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
  const rawConversations = Array.isArray(body.conversations) ? body.conversations : Array.isArray(payload) ? payload : [payload];

  return rawConversations.map((item) =>
    customConversationSchema.parse({
      ...(item && typeof item === "object" ? item : {}),
      externalSource: (item && typeof item === "object" && "externalSource" in item ? (item as { externalSource?: unknown }).externalSource : source) ?? source
    })
  );
}

async function loadOtrsFamilyConversations(integration: IntegrationWithCredential, config: IntegrationConfig) {
  const source = (integration.source || "otrs_family") as OtrsFamilySource;
  const profile = otrsFamilyProfileForSource(source);
  const baseUrl = requireText(integration.baseUrl, "Для OTRS/Znuny укажите Base URL.");
  const ticketId = requireText(config.ticketId, "Для OTRS/Znuny укажите TicketID для проверки или первого импорта.");
  const userLogin = requireText(config.userLogin, "Для OTRS/Znuny укажите UserLogin.");
  const password = requireText(optionalCredentialSecret(integration.credentials), "Для OTRS/Znuny сохраните пароль или API-секрет.");
  const ticketGetUrl = otrsFamilyTicketGetUrl(profile, ticketId, baseUrl);
  const url = otrsFamilyUrlWithQuery(
    ticketGetUrl,
    buildOtrsFamilyTicketGetQueryParams(profile, {
      userLogin,
      password,
      ticketId,
      includeAttachments: false
    })
  );
  const payload = (await fetchJson(url)) as OtrsFamilyTicketGetResponse;
  const tickets = extractOtrsFamilyTickets(payload);

  if (tickets.length === 0 || tickets.some((ticket) => !isOtrsFamilyTicketLike(ticket))) {
    throw new Error("Источник не вернул TicketGet-ответ с тикетом и статьями.");
  }

  return tickets.map((ticket) =>
    customConversationSchema.parse(
      normalizeOtrsFamilyTicket(ticket, {
        source,
        baseUrl,
        samplingReason: `Импорт ${config.sourceLabel ?? integration.displayName}: TicketGet ${ticketId}.`
      })
    )
  );
}

async function loadHelpdeskConversations(integration: IntegrationWithCredential, config: IntegrationConfig) {
  const ticketId = requireText(config.ticketId, "Для helpdesk-адаптера укажите ID обращения для проверки или первого импорта.");
  const result = await loadHelpdeskAdapterConversations({
    integration,
    ticketId,
    samplingReason: `Импорт ${integration.displayName}: обращение ${ticketId}.`
  });

  return result.conversations;
}

async function loadCustomApiConversations(integration: IntegrationWithCredential, limit: number) {
  const baseUrl = requireText(integration.baseUrl, "Для своего API укажите Base URL источника.");
  const token = optionalCredentialSecret(integration.credentials);
  const payload = await fetchJson(externalSourceUrl(baseUrl, `/conversations?limit=${encodeURIComponent(String(limit))}`), {
    headers: bearerHeaders(token)
  });
  const conversations = parseCustomApiPayload(payload, integration.source);

  if (conversations.length === 0) {
    throw new Error("Свой API не вернул массив conversations в поддерживаемом формате.");
  }

  return conversations;
}

async function loadIntegrationConversations(integration: IntegrationWithCredential, config: IntegrationConfig, limit: number) {
  if (integration.type === "otrs_family") {
    return loadOtrsFamilyConversations(integration, config);
  }

  if (integration.type === "native_helpdesk" || integration.type === "enterprise") {
    return loadHelpdeskConversations(integration, config);
  }

  return loadCustomApiConversations(integration, limit);
}

async function recordConnectorRunItem(input: {
  db: IntegrationRunItemClient;
  workspaceId: string;
  integrationRunId: string;
  conversation: CustomConversationInput;
  status: "previewed" | "imported";
  importedConversation?: ImportedConversation;
}) {
  const existing = await input.db.integrationRunItem.findFirst({
    where: {
      workspaceId: input.workspaceId,
      integrationRunId: input.integrationRunId,
      externalId: input.conversation.externalId
    },
    select: { id: true }
  });
  const data = {
    workspaceId: input.workspaceId,
    integrationRunId: input.integrationRunId,
    externalId: input.conversation.externalId,
    ticketNumber: input.conversation.externalId,
    status: input.status,
    articleCount: input.conversation.messages.length,
    privateArticleCount: input.conversation.messages.filter((message) => message.isPrivate).length,
    attachmentCount: 0,
    warningsJson: "[]",
    errorsJson: "[]",
    conversationId: input.importedConversation?.id ?? null,
    normalizedPreviewJson: JSON.stringify(input.conversation)
  };

  if (existing) {
    await input.db.integrationRunItem.update({
      where: { id: existing.id },
      data
    });
    return;
  }

  await input.db.integrationRunItem.create({ data });
}

async function writeConnectorRunResult(input: {
  db: Prisma.TransactionClient;
  workspaceId: string;
  integration: IntegrationWithCredential;
  integrationRunId?: string | null;
  dryRun: boolean;
  conversations: CustomConversationInput[];
  syncState: ReturnType<typeof buildIntegrationSyncState>;
  checkedCount: number;
  importedCount: number;
}) {
  const importedByExternalId = new Map<string, ImportedConversation>();
  const finishedAt = new Date();

  if (!input.dryRun) {
    for (const conversation of input.conversations) {
      const imported = await upsertCustomConversation(input.workspaceId, conversation, input.db);
      importedByExternalId.set(conversation.externalId, imported);
    }
  }

  if (input.integrationRunId) {
    for (const conversation of input.conversations) {
      await recordConnectorRunItem({
        db: input.db,
        workspaceId: input.workspaceId,
        integrationRunId: input.integrationRunId,
        conversation,
        status: input.dryRun ? "previewed" : "imported",
        importedConversation: importedByExternalId.get(conversation.externalId)
      });
    }

    await input.db.integrationRun.update({
      where: { id: input.integrationRunId },
      data: {
        status: input.dryRun ? "dry_run_ok" : "succeeded",
        checkedCount: input.checkedCount,
        importedCount: input.importedCount,
        skippedCount: 0,
        errorCount: 0,
        cursorJson: JSON.stringify(integrationRunCursorPayload(input.syncState)),
        checkpointJson: JSON.stringify(input.syncState.checkpoint),
        errorMessage: null,
        finishedAt
      }
    });
  }

  const integrationUpdate = await input.db.integration.updateMany({
    where: {
      id: input.integration.id,
      workspaceId: input.workspaceId,
      status: { not: "disabled" }
    },
    data: input.dryRun
      ? {
          status: "ready",
          lastDryRunAt: finishedAt,
          lastError: null
        }
      : {
          status: "active",
          lastSyncedAt: finishedAt,
          lastImportAt: finishedAt,
          lastError: null,
          syncStateJson: serializeIntegrationSyncState(input.syncState),
          syncCursor: input.syncState.cursor
        }
  });

  if (integrationUpdate.count !== 1) {
    throw new Error("Интеграция отключена.");
  }
}

export async function runIntegrationConnector(input: {
  workspaceId: string;
  integrationId: string;
  integrationRunId?: string | null;
  requestedLimit?: unknown;
  dryRun?: boolean;
  client?: Prisma.TransactionClient;
  beforeWrite?: ConnectorWriteGuard;
}): Promise<IntegrationRunResult> {
  const readDb = input.client ?? prisma;
  const integration = await readDb.integration.findFirst({
    where: {
      id: input.integrationId,
      workspaceId: input.workspaceId
    },
    include: {
      credentials: true
    }
  });

  if (!integration) {
    throw new Error("Интеграция не найдена в рабочем пространстве задачи.");
  }
  assertIntegrationEnabled(integration);
  assertIntegrationSourceContractSupported(integration);

  const config = parseConfig(integration.configJson);
  const limit = requestedLimit(input.requestedLimit, integration.importLimit);
  const conversations = (await loadIntegrationConversations(integration, config, limit)).slice(0, limit);
  const externalIds = conversations.map((conversation) => conversation.externalId);
  const checkedCount = conversations.length;
  const importedCount = input.dryRun ? 0 : conversations.length;
  const cursor = externalIds.at(-1) ?? integration.syncCursor;
  const syncState = buildIntegrationSyncState({
    source: integration.source,
    mode: integration.type,
    cursor,
    checkedCount,
    importedCount,
    skippedCount: 0,
    errorCount: 0,
    checkpoint: {
      externalIds,
      dryRun: Boolean(input.dryRun)
    }
  });

  const writeInput = {
    workspaceId: input.workspaceId,
    integration,
    integrationRunId: input.integrationRunId,
    dryRun: Boolean(input.dryRun),
    conversations: conversations as CustomConversationInput[],
    syncState,
    checkedCount,
    importedCount
  };

  if (input.client) {
    await input.beforeWrite?.(input.client);
    await writeConnectorRunResult({
      ...writeInput,
      db: input.client
    });
  } else {
    await prisma.$transaction(async (tx) => {
      await input.beforeWrite?.(tx);

      return writeConnectorRunResult({
        ...writeInput,
        db: tx
      });
    });
  }

  return {
    source: integration.source,
    mode: integration.type,
    dryRun: Boolean(input.dryRun),
    importedCount,
    checkedCount,
    externalIds
  };
}

export async function runSelectedOtrsImportConnector(input: {
  workspaceId: string;
  integrationId: string;
  integrationRunId: string;
  selectedItemIds: string[];
  beforeWrite?: ConnectorWriteGuard;
}): Promise<SelectedOtrsImportRunResult> {
  const result = await prisma.$transaction(async (tx) => {
    await input.beforeWrite?.(tx);

    return importSelectedOtrsRunItems({
      ...input,
      db: tx
    });
  });

  return {
    operation: "otrs_selected_import",
    importedCount: result.importedCount,
    errorCount: result.errorCount
  };
}
