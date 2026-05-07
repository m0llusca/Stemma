import type { Integration, IntegrationCredential, Prisma } from "@prisma/client";
import { upsertCustomConversation } from "@/lib/conversation-import";
import { prisma } from "@/lib/db";
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
import {
  nativeHelpdeskSources,
  normalizeNativeHelpdeskPayload,
  type NativeHelpdeskSource
} from "@/lib/normalizers/native-helpdesk";
import { decryptIntegrationSecretSlot } from "@/lib/integrations/otrs-family/credentials";
import { customConversationSchema, type CustomConversationInput } from "@/lib/validation/custom-api";

type IntegrationWithCredential = Integration & {
  credentials: IntegrationCredential[];
};

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

function basicTokenHeaders(token: string | undefined): Record<string, string> {
  return token
    ? {
        authorization: `Basic ${Buffer.from(`${token}:X`).toString("base64")}`
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

async function loadNativeHelpdeskPayload(source: NativeHelpdeskSource, baseUrl: string, ticketId: string, token: string | undefined) {
  if (source === "zendesk") {
    const [ticketPayload, commentsPayload] = await Promise.all([
      fetchJson(externalSourceUrl(baseUrl, `/api/v2/tickets/${encodeURIComponent(ticketId)}.json`), {
        headers: bearerHeaders(token)
      }),
      fetchJson(externalSourceUrl(baseUrl, `/api/v2/tickets/${encodeURIComponent(ticketId)}/comments.json`), {
        headers: bearerHeaders(token)
      })
    ]);

    return {
      ...(ticketPayload && typeof ticketPayload === "object" ? ticketPayload : {}),
      ...(commentsPayload && typeof commentsPayload === "object" ? commentsPayload : {})
    };
  }

  if (source === "freshdesk") {
    return fetchJson(externalSourceUrl(baseUrl, `/api/v2/tickets/${encodeURIComponent(ticketId)}?include=conversations`), {
      headers: basicTokenHeaders(token)
    });
  }

  if (source === "intercom") {
    return fetchJson(externalSourceUrl(baseUrl, `/conversations/${encodeURIComponent(ticketId)}`), {
      headers: {
        ...bearerHeaders(token),
        "intercom-version": "2.11"
      }
    });
  }

  return fetchJson(
    externalSourceUrl(
      baseUrl,
      `/crm/v3/objects/tickets/${encodeURIComponent(ticketId)}?properties=subject,content,hs_ticket_priority,hs_pipeline_stage,createdate,closed_date`
    ),
    {
      headers: bearerHeaders(token)
    }
  );
}

async function loadNativeHelpdeskConversations(integration: IntegrationWithCredential, config: IntegrationConfig) {
  const source = integration.source as NativeHelpdeskSource;

  if (!nativeHelpdeskSources.some((item) => item.value === source)) {
    throw new Error("Неподдерживаемый native helpdesk source.");
  }

  const baseUrl = requireText(integration.baseUrl, "Для helpdesk-адаптера укажите Base URL.");
  const ticketId = requireText(config.ticketId, "Для helpdesk-адаптера укажите ID обращения для проверки или первого импорта.");
  const token = requireText(optionalCredentialSecret(integration.credentials), "Для helpdesk-адаптера сохраните API-ключ или секрет приложения.");
  const payload = await loadNativeHelpdeskPayload(source, baseUrl, ticketId, token);
  const conversations = normalizeNativeHelpdeskPayload(payload, {
    source,
    baseUrl,
    samplingReason: `Импорт ${integration.displayName}: обращение ${ticketId}.`
  }).map((conversation) => customConversationSchema.parse(conversation));

  if (conversations.length === 0) {
    throw new Error("Источник не вернул обращение в поддерживаемом формате.");
  }

  return conversations;
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

  if (integration.type === "native_helpdesk") {
    return loadNativeHelpdeskConversations(integration, config);
  }

  return loadCustomApiConversations(integration, limit);
}

export async function runIntegrationConnector(input: {
  workspaceId: string;
  integrationId: string;
  integrationRunId?: string | null;
  requestedLimit?: unknown;
  dryRun?: boolean;
  client?: Prisma.TransactionClient;
}): Promise<IntegrationRunResult> {
  const db = input.client ?? prisma;
  const integration = await db.integration.findFirst({
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

  const config = parseConfig(integration.configJson);
  const limit = requestedLimit(input.requestedLimit, integration.importLimit);
  const conversations = (await loadIntegrationConversations(integration, config, limit)).slice(0, limit);
  const externalIds = conversations.map((conversation) => conversation.externalId);

  if (!input.dryRun) {
    for (const conversation of conversations as CustomConversationInput[]) {
      await upsertCustomConversation(input.workspaceId, conversation, db);
    }
  }

  if (input.integrationRunId) {
    await db.integrationRun.update({
      where: { id: input.integrationRunId },
      data: {
        status: input.dryRun ? "dry_run_ok" : "succeeded",
        importedCount: input.dryRun ? 0 : conversations.length,
        errorCount: 0,
        errorMessage: null,
        finishedAt: new Date()
      }
    });
  }

  await db.integration.update({
    where: { id: integration.id },
    data: {
      status: input.dryRun ? "ready" : "active",
      lastSyncedAt: input.dryRun ? integration.lastSyncedAt : new Date(),
      lastDryRunAt: input.dryRun ? new Date() : integration.lastDryRunAt,
      lastImportAt: input.dryRun ? integration.lastImportAt : new Date(),
      lastError: null,
      syncCursor: externalIds.at(-1) ?? integration.syncCursor
    }
  });

  return {
    source: integration.source,
    mode: integration.type,
    dryRun: Boolean(input.dryRun),
    importedCount: input.dryRun ? 0 : conversations.length,
    checkedCount: conversations.length,
    externalIds
  };
}
