import {
  basicApiTokenHeaders,
  basicCredentialHeaders,
  bearerHeaders,
  createHelpdeskHttpClient,
  type HelpdeskTransport
} from "@/lib/integrations/helpdesk-adapters/http";
import { HelpdeskAdapterError } from "@/lib/integrations/helpdesk-adapters/errors";
import { createHelpdeskAdapter } from "@/lib/integrations/helpdesk-adapters/index";
import type { PhaseBHelpdeskSource } from "@/lib/integrations/helpdesk-adapters/types";
import {
  detectSourceFromHost,
  extractTicketIdFromPath,
  normalizeHelpdeskBaseUrl
} from "@/lib/integrations/connect/url-normalize";
import { runHelpdeskCapabilityProbe } from "@/lib/integrations/connect/probe-capabilities";
import type {
  CapabilityProbeResult,
  ConnectContext,
  CredentialField,
  SourceConnectionProfile,
  TestImportResult,
  VerifyResult
} from "@/lib/integrations/connect/types";

type HelpdeskProfileConfig = {
  source: PhaseBHelpdeskSource;
  urlPolicy: "required" | "fixed";
  fixedBaseUrl?: string;
  hostPattern?: RegExp;
  authMode: string;
  credentialFields: CredentialField[];
  // строит секрет для слота auth_password из собранных полей
  buildSecret(creds: Record<string, string>): string;
  // путь дешёвого whoami/list probe
  verifyPath: string;
  authHeaders(secret: string): Record<string, string>;
};

// Внутренний transport-инъектор только для тестов: подменяет сетевой слой
// HTTP-клиента фейковым ответом с заданным statusCode/body.
type TestableContext = ConnectContext & { __transport?: HelpdeskTransport };

function buildHelpdeskProfile(config: HelpdeskProfileConfig): SourceConnectionProfile {
  return {
    source: config.source,
    type: "native_helpdesk",
    urlPolicy: config.urlPolicy,
    fixedBaseUrl: config.fixedBaseUrl,
    hostPatterns: config.hostPattern ? [config.hostPattern] : undefined,
    credentialFields: config.credentialFields,
    normalizeUrl(raw: string) {
      if (config.urlPolicy === "fixed") {
        return { baseUrl: config.fixedBaseUrl!, hints: { detectedSource: config.source } };
      }
      const { baseUrl } = normalizeHelpdeskBaseUrl(raw);
      return {
        baseUrl,
        hints: {
          detectedSource: detectSourceFromHost(raw),
          testTicketId: extractTicketIdFromPath(raw)
        }
      };
    },
    async probeCapabilities(ctx: ConnectContext): Promise<CapabilityProbeResult> {
      const token = config.buildSecret(ctx.credentials);
      return runHelpdeskCapabilityProbe({ source: config.source, ctx, token });
    },
    async verifyAuth(rawCtx: ConnectContext): Promise<VerifyResult> {
      const ctx = rawCtx as TestableContext;
      const secret = config.buildSecret(ctx.credentials);
      const client = createHelpdeskHttpClient(ctx.__transport ? { transport: ctx.__transport } : {});
      try {
        // requestJson бросает HelpdeskAdapterError на любой не-2xx ответ
        // (auth_failed для 401/403, http_error для прочих) и резолвится
        // только при 2xx. Поэтому успешный возврат уже означает авторизацию.
        await client.requestJson({
          source: config.source,
          operation: "diagnostics",
          method: "GET",
          url: `${ctx.baseUrl}${config.verifyPath}`,
          headers: config.authHeaders(secret),
          timeoutMs: 15_000,
          maxResponseBytes: 200_000
        });
        return {
          status: "ok",
          detail: "Авторизация подтверждена.",
          authMode: config.authMode,
          secretSlots: [{ kind: "auth_password", secret }]
        };
      } catch (error) {
        return classifyVerifyError(error, config.authMode);
      }
    },
    async testImport(ctx: ConnectContext): Promise<TestImportResult> {
      const ticketId = ctx.testTicketId ?? ctx.hints?.testTicketId;
      if (!ticketId) {
        return { status: "skipped", detail: "Укажите № тикета для пробного импорта." };
      }
      const secret = config.buildSecret(ctx.credentials);
      try {
        const adapter = createHelpdeskAdapter(config.source);
        const result = await adapter.loadConversation({
          source: config.source,
          baseUrl: ctx.baseUrl,
          externalId: ticketId,
          token: secret
        });
        return {
          status: "ok",
          detail: `Импортировано обращений: ${result.conversations.length}.`,
          conversation: result.conversations[0]
        };
      } catch (error) {
        return {
          status: "warning",
          detail: "Пробный импорт не удался, но авторизация подтверждена.",
          hint: error instanceof Error ? error.message : undefined
        };
      }
    }
  };
}

// Классифицирует ошибку requestJson в результат verifyAuth с русской подсказкой.
function classifyVerifyError(error: unknown, authMode: string): VerifyResult {
  if (error instanceof HelpdeskAdapterError) {
    const statusCode = extractStatusCode(error);
    if (error.code === "auth_failed" || statusCode === 401 || statusCode === 403) {
      const hint = "Авторизация отклонена — проверьте токен/пароль.";
      return { status: "failed", detail: hint, hint, authMode, secretSlots: [] };
    }
    if (statusCode === 404) {
      const hint = "Эндпоинт не найден — проверьте адрес источника.";
      return { status: "failed", detail: hint, hint, authMode, secretSlots: [] };
    }
    if (error.code === "timeout") {
      const hint = "Источник не ответил за отведённое время.";
      return { status: "failed", detail: hint, hint, authMode, secretSlots: [] };
    }
    if (error.code === "network_error") {
      const hint = "Не удалось подключиться к источнику — проверьте адрес и доступность.";
      return { status: "failed", detail: hint, hint, authMode, secretSlots: [] };
    }
    if (typeof statusCode === "number") {
      const hint = `Источник ответил кодом ${statusCode}.`;
      return { status: "failed", detail: hint, hint, authMode, secretSlots: [] };
    }
    return { status: "failed", detail: error.safeMessage, hint: error.safeMessage, authMode, secretSlots: [] };
  }
  const hint = error instanceof Error ? error.message : "Неизвестная ошибка подключения.";
  return { status: "failed", detail: "Не удалось подключиться к источнику.", hint, authMode, secretSlots: [] };
}

// Достаёт statusCode из diagnostic-конверта HelpdeskAdapterError (redacted, но
// statusCode сохраняется как число).
function extractStatusCode(error: HelpdeskAdapterError): number | undefined {
  const diagnostic = error.diagnostic;
  if (diagnostic && typeof diagnostic === "object" && "statusCode" in diagnostic) {
    const value = (diagnostic as { statusCode?: unknown }).statusCode;
    return typeof value === "number" ? value : undefined;
  }
  return undefined;
}

const emailTokenFields: CredentialField[] = [
  {
    key: "email",
    label: "Email агента",
    placeholder: "agent@example.com",
    secret: false,
    hint: "Учётная запись агента, к которой привязан API-токен."
  },
  { key: "apiToken", label: "API-токен", secret: true, hint: "Создаётся в настройках API источника." }
];

const singleTokenField: CredentialField[] = [
  { key: "token", label: "Токен доступа", secret: true, hint: "Bearer/Private App токен из настроек интеграций." }
];

export const helpdeskProfiles = {
  zendesk: buildHelpdeskProfile({
    source: "zendesk",
    urlPolicy: "required",
    hostPattern: /(^|\.)zendesk\.com$/i,
    authMode: "basic_api_token",
    credentialFields: emailTokenFields,
    buildSecret: (c) => `${c.email}/token:${c.apiToken}`,
    verifyPath: "/api/v2/users/me.json",
    authHeaders: (secret) => basicCredentialHeaders(secret)
  }),
  freshdesk: buildHelpdeskProfile({
    source: "freshdesk",
    urlPolicy: "required",
    hostPattern: /(^|\.)freshdesk\.com$/i,
    authMode: "basic_api_key",
    credentialFields: singleTokenField,
    buildSecret: (c) => c.token,
    verifyPath: "/api/v2/agents/me",
    authHeaders: (secret) => basicApiTokenHeaders(secret, "X")
  }),
  intercom: buildHelpdeskProfile({
    source: "intercom",
    urlPolicy: "fixed",
    fixedBaseUrl: "https://api.intercom.io",
    authMode: "bearer_token",
    credentialFields: singleTokenField,
    buildSecret: (c) => c.token,
    verifyPath: "/me",
    authHeaders: (secret) => bearerHeaders(secret)
  }),
  hubspot: buildHelpdeskProfile({
    source: "hubspot",
    urlPolicy: "fixed",
    fixedBaseUrl: "https://api.hubapi.com",
    authMode: "private_app_token",
    credentialFields: singleTokenField,
    buildSecret: (c) => c.token,
    verifyPath: "/account-info/v3/details",
    authHeaders: (secret) => bearerHeaders(secret)
  }),
  jira: buildHelpdeskProfile({
    source: "jira",
    urlPolicy: "required",
    hostPattern: /(^|\.)atlassian\.net$/i,
    authMode: "basic_api_token",
    credentialFields: emailTokenFields,
    buildSecret: (c) => `${c.email}:${c.apiToken}`,
    verifyPath: "/rest/api/2/myself",
    authHeaders: (secret) => basicCredentialHeaders(secret)
  })
} satisfies Record<string, SourceConnectionProfile>;
