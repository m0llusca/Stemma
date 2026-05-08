import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createOtrsHttpClient, redactOtrsPayload, redactOtrsUrl } from "@/lib/integrations/otrs-family/client";
import {
  buildDefaultOtrsConnectorConfig,
  buildOtrsWebServiceBaseUrl,
  parseOtrsConnectorConfig,
  type OtrsConnectorConfig
} from "@/lib/integrations/otrs-family/config";
import { OtrsConnectorError } from "@/lib/integrations/otrs-family/errors";
import { normalizeOtrsFamilyTicketGetResponseForImport } from "@/lib/integrations/otrs-family/normalization";
import { buildTicketGetRequest, buildTicketSearchRequest, parseTicketSearchResponse } from "@/lib/integrations/otrs-family/requests";

type SmokeStepStatus = "succeeded" | "warning" | "failed" | "skipped";

type SmokeStep = {
  key: string;
  status: SmokeStepStatus;
  detail?: unknown;
  durationMs?: number;
};

type SmokeRuntime = {
  config: OtrsConnectorConfig;
  baseUrl: string;
  userLogin: string;
  password: string;
  caBundle?: string;
  caBundleMetadata?: {
    path: string;
    sha256: string;
    bytes: number;
  };
};

type PreviewResult = {
  mode: "manual_ticket_id" | "ticket_search";
  searchedTicketIds: string[];
  fetchedTicketId?: string;
  normalizedConversationCount: number;
  externalIds: string[];
  articleCountsByExternalId: Record<string, number>;
  privateArticleCountsByExternalId: Record<string, number>;
  attachmentCountsByExternalId: Record<string, number>;
  warningCodes: string[];
  conversations: Array<ReturnType<typeof normalizeOtrsFamilyTicketGetResponseForImport>[number]["conversation"]>;
};

type DiagnosticResult = {
  status: "succeeded" | "warning" | "failed";
  mode: PreviewResult["mode"];
  searchedTicketIds: string[];
  fetchedTicketId?: string;
  normalizedConversationCount: number;
  duplicateCount?: number;
  steps: SmokeStep[];
};

type DiagnosticRequestState =
  | {
      operation: "ticket_search";
      result?: unknown;
      error?: unknown;
    }
  | {
      operation: "ticket_get";
      ticketId: string;
      result?: unknown;
      error?: unknown;
    };

const redactedValue = "[REDACTED]";

async function main() {
  if (process.env.OTRS_LIVE_SMOKE !== "1") {
    throw new Error("Refusing to run live OTRS smoke: set OTRS_LIVE_SMOKE=1 to acknowledge live OTRS access.");
  }

  const steps: SmokeStep[] = [];
  const runtime = await recordStep(steps, "config", buildRuntime);
  const diagnostics = await runDiagnostics(runtime);
  let preview: PreviewResult | undefined;
  let importResult: unknown = {
    status: "skipped",
    reason: diagnostics.status === "failed" ? "diagnostics_failed" : "preview_failed"
  };
  let finalError: unknown;

  if (diagnostics.status === "failed") {
    finalError = new Error("OTRS live smoke diagnostics failed.");
  } else {
    try {
      preview = await runPreview(runtime, steps);
    } catch (error) {
      finalError = error;
    }

    if (preview) {
      try {
        importResult = await runSelectedImport(preview, steps);
      } catch (error) {
        finalError = error;
      }
    }
  }

  const failedStep = steps.find((step) => step.status === "failed");
  const failed = Boolean(failedStep || diagnostics.status === "failed" || finalError);
  const summary = redactSummary(
    {
      status: failed ? "failed" : "succeeded",
      error: finalError ? serializeError(finalError) : undefined,
      endpoint: buildOtrsWebServiceBaseUrl({
        baseUrl: runtime.baseUrl,
        webServiceName: runtime.config.webServiceName
      }),
      webServiceName: runtime.config.webServiceName,
      liveImportRequested: process.env.OTRS_LIVE_IMPORT === "1",
      caBundle: runtime.caBundleMetadata,
      diagnostics,
      preview: preview
        ? {
            mode: preview.mode,
            searchedTicketIds: preview.searchedTicketIds,
            fetchedTicketId: preview.fetchedTicketId,
            normalizedConversationCount: preview.normalizedConversationCount,
            externalIds: preview.externalIds,
            articleCountsByExternalId: preview.articleCountsByExternalId,
            privateArticleCountsByExternalId: preview.privateArticleCountsByExternalId,
            attachmentCountsByExternalId: preview.attachmentCountsByExternalId,
            warningCodes: preview.warningCodes
          }
        : null,
      import: importResult,
      steps
    },
    runtime
  );

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

  if (failed) {
    process.exitCode = 1;
  }
}

async function buildRuntime(): Promise<SmokeRuntime> {
  const baseUrl = requiredEnv("OTRS_BASE_URL");
  const userLogin = requiredEnv("OTRS_USER_LOGIN");
  const password = requiredEnv("OTRS_PASSWORD");
  const defaultConfig = buildDefaultOtrsConnectorConfig();
  const config = parseOtrsConnectorConfig({
    ...defaultConfig,
    webServiceName: process.env.OTRS_WEBSERVICE_NAME?.trim() || defaultConfig.webServiceName
  });
  const caBundlePath = process.env.OTRS_CA_BUNDLE_PATH?.trim();
  const caBundle = caBundlePath ? await readFile(caBundlePath, "utf8") : undefined;
  const caBundleMetadata = caBundlePath && caBundle
    ? {
        path: caBundlePath,
        sha256: createHash("sha256").update(normalizePem(caBundle)).digest("hex"),
        bytes: Buffer.byteLength(caBundle)
      }
    : undefined;

  return {
    config,
    baseUrl,
    userLogin,
    password,
    caBundle,
    caBundleMetadata
  };
}

async function runDiagnostics(runtime: SmokeRuntime): Promise<DiagnosticResult> {
  const diagnosticSteps: SmokeStep[] = [];
  const client = createOtrsHttpClient({
    config: runtime.config,
    baseUrl: runtime.baseUrl,
    userLogin: runtime.userLogin,
    password: runtime.password,
    caBundle: runtime.caBundle
  });
  const mode: PreviewResult["mode"] = process.env.OTRS_TEST_TICKET_ID?.trim() ? "manual_ticket_id" : "ticket_search";
  const context: Pick<DiagnosticResult, "mode" | "searchedTicketIds" | "normalizedConversationCount"> & {
    fetchedTicketId?: string;
    duplicateCount?: number;
  } = {
    mode,
    searchedTicketIds: [],
    normalizedConversationCount: 0
  };
  let firstRequest: DiagnosticRequestState | undefined;
  let normalizedConversations: PreviewResult["conversations"] = [];

  await recordDiagnosticStep(diagnosticSteps, "config", async () => ({
    status: "succeeded",
    detail: {
      product: runtime.config.product,
      endpoint: buildOtrsWebServiceBaseUrl({
        baseUrl: runtime.baseUrl,
        webServiceName: runtime.config.webServiceName
      }),
      webServiceName: runtime.config.webServiceName,
      requestTimeoutMs: runtime.config.limits.requestTimeoutMs,
      maxResponseBytes: runtime.config.limits.maxResponseBytes
    }
  }));

  if (isHttps(runtime.baseUrl)) {
    await recordDiagnosticStep(diagnosticSteps, "tls", async () => {
      firstRequest = await executeDiagnosticFirstRequest(runtime, client);

      if (isConnectorErrorCode(firstRequest.error, "tls_failed")) {
        return {
          status: "failed",
          detail: serializeError(firstRequest.error)
        };
      }

      return {
        status: "succeeded",
        detail: {
          protocol: "https",
          caBundleConfigured: Boolean(runtime.caBundle),
          firstRequestOperation: firstRequest.operation
        }
      };
    });
  } else {
    await recordDiagnosticStep(diagnosticSteps, "tls", async () => ({
      status: "succeeded",
      detail: {
        protocol: protocolForBaseUrl(runtime.baseUrl) || "unknown",
        caBundleConfigured: false
      }
    }));
  }

  if (hasFailed(diagnosticSteps)) {
    return finishDiagnostics(context, diagnosticSteps);
  }

  await recordDiagnosticStep(diagnosticSteps, "webservice", async () => {
    firstRequest ??= await executeDiagnosticFirstRequest(runtime, client);

    if (isConnectorErrorCode(firstRequest.error, "webservice_unreachable") || isConnectorErrorCode(firstRequest.error, "timeout")) {
      return {
        status: "failed",
        detail: serializeError(firstRequest.error)
      };
    }

    return {
      status: "succeeded",
      detail: {
        endpoint: buildOtrsWebServiceBaseUrl({
          baseUrl: runtime.baseUrl,
          webServiceName: runtime.config.webServiceName
        }),
        firstRequestOperation: firstRequest.operation
      }
    };
  });

  if (hasFailed(diagnosticSteps)) {
    return finishDiagnostics(context, diagnosticSteps);
  }

  await recordDiagnosticStep(diagnosticSteps, "auth", async () => {
    firstRequest ??= await executeDiagnosticFirstRequest(runtime, client);

    if (isConnectorErrorCode(firstRequest.error, "auth_failed")) {
      return {
        status: "failed",
        detail: serializeError(firstRequest.error)
      };
    }

    return {
      status: "succeeded",
      detail: {
        authenticated: firstRequest.error ? "not_rejected" : true,
        firstRequestOperation: firstRequest.operation
      }
    };
  });

  if (hasFailed(diagnosticSteps)) {
    return finishDiagnostics(context, diagnosticSteps);
  }

  if (mode === "manual_ticket_id") {
    diagnosticSteps.push({
      key: "ticket_search",
      status: "skipped",
      detail: {
        reason: "manual_ticket_id_supplied"
      }
    });
  } else {
    await recordDiagnosticStep(diagnosticSteps, "ticket_search", async () => {
      const searchRequest =
        firstRequest?.operation === "ticket_search" ? firstRequest : await executeTicketSearchRequest(runtime, client);

      if (searchRequest.error) {
        return {
          status: "failed",
          detail: serializeError(searchRequest.error)
        };
      }

      context.searchedTicketIds = parseTicketSearchResponse(searchRequest.result).slice(0, 1);

      return {
        status: context.searchedTicketIds.length > 0 ? "succeeded" : "failed",
        detail: {
          limit: 1,
          filters: ticketSearchFilters(),
          ticketIds: context.searchedTicketIds,
          reason: context.searchedTicketIds.length > 0 ? undefined : "no_ticket_id"
        }
      };
    });
  }

  if (hasFailed(diagnosticSteps)) {
    return finishDiagnostics(context, diagnosticSteps);
  }

  const targetTicketId = process.env.OTRS_TEST_TICKET_ID?.trim() || context.searchedTicketIds[0];

  await recordDiagnosticStep(diagnosticSteps, "ticket_get", async () => {
    if (!targetTicketId) {
      return {
        status: "failed",
        detail: {
          reason: "no_ticket_id"
        }
      };
    }

    const getRequest =
      firstRequest?.operation === "ticket_get" && firstRequest.ticketId === targetTicketId
        ? firstRequest
        : await executeTicketGetRequest(runtime, client, targetTicketId);

    if (getRequest.error) {
      return {
        status: "failed",
        detail: serializeError(getRequest.error)
      };
    }

    const normalized = normalizePreview(mode, context.searchedTicketIds, targetTicketId, getRequest.result, runtime.baseUrl);
    context.fetchedTicketId = targetTicketId;
    normalizedConversations = normalized.conversations;

    return {
      status: "succeeded",
      detail: {
        ticketId: targetTicketId
      }
    };
  });

  if (hasFailed(diagnosticSteps)) {
    return finishDiagnostics(context, diagnosticSteps);
  }

  await recordDiagnosticStep(diagnosticSteps, "normalize", async () => {
    if (normalizedConversations.length === 0) {
      return {
        status: "failed",
        detail: {
          reason: "no_normalized_conversation"
        }
      };
    }

    context.normalizedConversationCount = normalizedConversations.length;

    return {
      status: "succeeded",
      detail: {
        conversationCount: normalizedConversations.length,
        externalIds: normalizedConversations.map((conversation) => conversation.externalId),
        articleCountsByExternalId: Object.fromEntries(
          normalizedConversations.map((conversation) => [conversation.externalId, conversation.messages.length])
        )
      }
    };
  });

  if (hasFailed(diagnosticSteps)) {
    return finishDiagnostics(context, diagnosticSteps);
  }

  await recordDiagnosticStep(diagnosticSteps, "db_dry_run", async () => {
    if (!process.env.DATABASE_URL?.trim()) {
      return {
        status: "skipped",
        detail: {
          reason: "DATABASE_URL is not set"
        }
      };
    }

    const workspaceId = process.env.OTRS_LIVE_WORKSPACE_ID?.trim();

    if (!workspaceId) {
      return {
        status: "skipped",
        detail: {
          reason: "OTRS_LIVE_WORKSPACE_ID is not set"
        }
      };
    }

    const { prisma } = await import("@/lib/db");

    try {
      const duplicates = [];

      for (const conversation of normalizedConversations) {
        const duplicate = await prisma.conversation.findUnique({
          where: {
            workspaceId_externalSource_externalId: {
              workspaceId,
              externalSource: conversation.externalSource,
              externalId: conversation.externalId
            }
          },
          select: {
            id: true
          }
        });

        if (duplicate) {
          duplicates.push({
            externalSource: conversation.externalSource,
            externalId: conversation.externalId,
            conversationId: duplicate.id
          });
        }
      }

      context.duplicateCount = duplicates.length;

      return {
        status: duplicates.length > 0 ? "warning" : "succeeded",
        detail: {
          checkedCount: normalizedConversations.length,
          duplicateCount: duplicates.length,
          duplicates
        }
      };
    } finally {
      await prisma.$disconnect();
    }
  });

  return finishDiagnostics(context, diagnosticSteps);
}

async function executeDiagnosticFirstRequest(
  runtime: SmokeRuntime,
  client: ReturnType<typeof createOtrsHttpClient>
): Promise<DiagnosticRequestState> {
  const manualTicketId = process.env.OTRS_TEST_TICKET_ID?.trim();

  if (manualTicketId) {
    return executeTicketGetRequest(runtime, client, manualTicketId);
  }

  return executeTicketSearchRequest(runtime, client);
}

async function executeTicketSearchRequest(
  runtime: SmokeRuntime,
  client: ReturnType<typeof createOtrsHttpClient>
): Promise<Extract<DiagnosticRequestState, { operation: "ticket_search" }>> {
  try {
    const result = await client.requestJson(
      buildTicketSearchRequest({
        config: runtime.config,
        baseUrl: runtime.baseUrl,
        userLogin: runtime.userLogin,
        password: runtime.password,
        filters: ticketSearchFilters(),
        limit: 1
      })
    );

    return {
      operation: "ticket_search",
      result
    };
  } catch (error) {
    return {
      operation: "ticket_search",
      error
    };
  }
}

async function executeTicketGetRequest(
  runtime: SmokeRuntime,
  client: ReturnType<typeof createOtrsHttpClient>,
  ticketId: string
): Promise<Extract<DiagnosticRequestState, { operation: "ticket_get" }>> {
  try {
    const result = await client.requestJson(
      buildTicketGetRequest({
        config: runtime.config,
        baseUrl: runtime.baseUrl,
        userLogin: runtime.userLogin,
        password: runtime.password,
        ticketId,
        allArticles: true,
        includeAttachments: true
      })
    );

    return {
      operation: "ticket_get",
      ticketId,
      result
    };
  } catch (error) {
    return {
      operation: "ticket_get",
      ticketId,
      error
    };
  }
}

async function runPreview(runtime: SmokeRuntime, steps: SmokeStep[]): Promise<PreviewResult> {
  const client = createOtrsHttpClient({
    config: runtime.config,
    baseUrl: runtime.baseUrl,
    userLogin: runtime.userLogin,
    password: runtime.password,
    caBundle: runtime.caBundle
  });
  const manualTicketId = process.env.OTRS_TEST_TICKET_ID?.trim();

  if (manualTicketId) {
    const payload = await recordStep(steps, "ticket_get", () =>
      client.requestJson(
        buildTicketGetRequest({
          config: runtime.config,
          baseUrl: runtime.baseUrl,
          userLogin: runtime.userLogin,
          password: runtime.password,
          ticketId: manualTicketId,
          allArticles: true,
          includeAttachments: true
        })
      )
    );

    return recordStep(steps, "normalize", () =>
      normalizePreview("manual_ticket_id", [], manualTicketId, payload, runtime.baseUrl)
    );
  }

  const filters = ticketSearchFilters();
  const searchPayload = await recordStep(steps, "ticket_search", () =>
    client.requestJson(
      buildTicketSearchRequest({
        config: runtime.config,
        baseUrl: runtime.baseUrl,
        userLogin: runtime.userLogin,
        password: runtime.password,
        filters,
        limit: 1
      })
    )
  );
  const ticketIds = parseTicketSearchResponse(searchPayload).slice(0, 1);

  if (ticketIds.length === 0) {
    throw new Error("OTRS TicketSearch returned no TicketID values for the live smoke filters.");
  }

  const ticketId = ticketIds[0];
  const getPayload = await recordStep(steps, "ticket_get", () =>
    client.requestJson(
      buildTicketGetRequest({
        config: runtime.config,
        baseUrl: runtime.baseUrl,
        userLogin: runtime.userLogin,
        password: runtime.password,
        ticketId,
        allArticles: true,
        includeAttachments: true
      })
    )
  );

  return recordStep(steps, "normalize", () => normalizePreview("ticket_search", ticketIds, ticketId, getPayload, runtime.baseUrl));
}

async function runSelectedImport(preview: PreviewResult, steps: SmokeStep[]) {
  if (process.env.OTRS_LIVE_IMPORT !== "1") {
    steps.push({
      key: "selected_import",
      status: "skipped",
      detail: {
        reason: "OTRS_LIVE_IMPORT is not 1"
      }
    });

    return {
      status: "skipped",
      reason: "OTRS_LIVE_IMPORT is not 1"
    };
  }

  return recordStep(steps, "selected_import", async () => {
    if (!process.env.DATABASE_URL?.trim()) {
      throw new Error("DATABASE_URL is required when OTRS_LIVE_IMPORT=1.");
    }

    const workspaceId = process.env.OTRS_LIVE_WORKSPACE_ID?.trim();

    if (!workspaceId) {
      throw new Error("OTRS_LIVE_WORKSPACE_ID is required when OTRS_LIVE_IMPORT=1.");
    }

    const [{ upsertCustomConversationsAtomic }, { prisma }] = await Promise.all([
      import("@/lib/conversation-import"),
      import("@/lib/db")
    ]);

    try {
      const imported = await upsertCustomConversationsAtomic(workspaceId, preview.conversations);

      return {
        status: "imported",
        workspaceId,
        importedCount: imported.length,
        externalIds: imported.map((conversation) => conversation.externalId)
      };
    } finally {
      await prisma.$disconnect();
    }
  });
}

async function recordStep<T>(steps: SmokeStep[], key: string, fn: () => Promise<T> | T): Promise<T> {
  const startedAt = Date.now();

  try {
    const result = await fn();
    steps.push({
      key,
      status: "succeeded",
      durationMs: Date.now() - startedAt
    });
    return result;
  } catch (error) {
    steps.push({
      key,
      status: "failed",
      durationMs: Date.now() - startedAt,
      detail: serializeError(error)
    });
    throw error;
  }
}

async function recordDiagnosticStep(
  steps: SmokeStep[],
  key: string,
  fn: () => Promise<{ status: SmokeStepStatus; detail?: unknown }> | { status: SmokeStepStatus; detail?: unknown }
) {
  const startedAt = Date.now();

  try {
    const result = await fn();
    steps.push({
      key,
      status: result.status,
      detail: result.detail,
      durationMs: Date.now() - startedAt
    });
  } catch (error) {
    steps.push({
      key,
      status: "failed",
      durationMs: Date.now() - startedAt,
      detail: serializeError(error)
    });
  }
}

function normalizePreview(
  mode: PreviewResult["mode"],
  searchedTicketIds: string[],
  fetchedTicketId: string,
  payload: unknown,
  baseUrl: string
): PreviewResult {
  const normalized = normalizeOtrsFamilyTicketGetResponseForImport(payload as Parameters<typeof normalizeOtrsFamilyTicketGetResponseForImport>[0], {
    source: "otrs",
    baseUrl
  });

  if (normalized.length === 0) {
    throw new Error("OTRS TicketGet response did not contain a normalizable ticket.");
  }

  return {
    mode,
    searchedTicketIds,
    fetchedTicketId,
    normalizedConversationCount: normalized.length,
    externalIds: normalized.map((item) => item.conversation.externalId),
    articleCountsByExternalId: Object.fromEntries(
      normalized.map((item) => [item.conversation.externalId, item.stats.articleCount])
    ),
    privateArticleCountsByExternalId: Object.fromEntries(
      normalized.map((item) => [item.conversation.externalId, item.stats.privateArticleCount])
    ),
    attachmentCountsByExternalId: Object.fromEntries(
      normalized.map((item) => [item.conversation.externalId, item.stats.attachmentCount])
    ),
    warningCodes: Array.from(new Set(normalized.flatMap((item) => item.warnings.map((warning) => warning.code)))),
    conversations: normalized.map((item) => item.conversation)
  };
}

function finishDiagnostics(
  context: Pick<DiagnosticResult, "mode" | "searchedTicketIds" | "normalizedConversationCount"> & {
    fetchedTicketId?: string;
    duplicateCount?: number;
  },
  steps: SmokeStep[]
): DiagnosticResult {
  return {
    status: hasFailed(steps) ? "failed" : steps.some((step) => step.status === "warning") ? "warning" : "succeeded",
    mode: context.mode,
    searchedTicketIds: context.searchedTicketIds,
    fetchedTicketId: context.fetchedTicketId,
    normalizedConversationCount: context.normalizedConversationCount,
    duplicateCount: context.duplicateCount,
    steps
  };
}

function hasFailed(steps: SmokeStep[]) {
  return steps.some((step) => step.status === "failed");
}

function ticketSearchFilters() {
  const filters: Record<string, unknown> = {};
  const queue = process.env.OTRS_SEARCH_QUEUE?.trim();
  const stateType = process.env.OTRS_SEARCH_STATE_TYPE?.trim();

  if (queue) {
    filters.Queue = queue;
  }

  if (stateType) {
    filters.StateType = stateType;
  }

  return filters;
}

function isHttps(baseUrl: string) {
  return protocolForBaseUrl(baseUrl) === "https";
}

function protocolForBaseUrl(baseUrl: string) {
  try {
    return new URL(baseUrl).protocol.replace(/:$/, "");
  } catch {
    return "";
  }
}

function isConnectorErrorCode(error: unknown, code: OtrsConnectorError["code"]): error is OtrsConnectorError {
  return error instanceof OtrsConnectorError && error.code === code;
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required for live OTRS smoke.`);
  }

  return value;
}

function normalizePem(value: string) {
  return value.replace(/\r\n/g, "\n").trim();
}

function redactSummary(value: unknown, runtime: SmokeRuntime) {
  const redacted = replaceKnownSecrets(redactOtrsPayload(value), [
    runtime.userLogin,
    runtime.password,
    runtime.caBundle,
    runtime.caBundleMetadata?.sha256
  ]);

  return redactUrls(redacted);
}

function serializeError(error: unknown) {
  if (error instanceof OtrsConnectorError) {
    return {
      name: error.name,
      code: error.code,
      message: error.safeMessage,
      detail: error.redactedDetail,
      remediationHint: error.remediationHint
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message
    };
  }

  return {
    message: String(error)
  };
}

function replaceKnownSecrets(value: unknown, secrets: Array<string | undefined>): unknown {
  const normalizedSecrets = Array.from(new Set(secrets.filter((secret): secret is string => Boolean(secret?.length))));

  if (normalizedSecrets.length === 0) {
    return value;
  }

  if (typeof value === "string") {
    return normalizedSecrets.reduce((redacted, secret) => redacted.split(secret).join(redactedValue), value);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => replaceKnownSecrets(item, normalizedSecrets));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [key, replaceKnownSecrets(nestedValue, normalizedSecrets)])
  );
}

function redactUrls(value: unknown): unknown {
  if (typeof value === "string") {
    return /^https?:\/\//i.test(value) ? redactOtrsUrl(value) : value;
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(redactUrls);
  }

  return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [key, redactUrls(nestedValue)]));
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
