import { buildOtrsWebServiceBaseUrl, parseOtrsConnectorConfig, type OtrsConnectorConfig } from "@/lib/integrations/otrs-family/config";
import { redactOtrsPayload, redactOtrsUrl, type OtrsHttpClient } from "@/lib/integrations/otrs-family/client";
import { OtrsConnectorError, type OtrsConnectorErrorCode } from "@/lib/integrations/otrs-family/errors";
import { buildTicketGetRequest, buildTicketSearchRequest, parseTicketSearchResponse } from "@/lib/integrations/otrs-family/requests";
import {
  normalizeOtrsFamilyTicketGetResponse,
  type OtrsFamilySource,
  type OtrsFamilyTicketGetResponse
} from "@/lib/normalizers/otrs-family";
import { customConversationSchema, type CustomConversationInput } from "@/lib/validation/custom-api";

export const diagnosticStepDefinitions = [
  { key: "config", label: "Configuration" },
  { key: "tls", label: "TLS" },
  { key: "webservice", label: "WebService" },
  { key: "auth", label: "Authentication" },
  { key: "ticket_search", label: "TicketSearch" },
  { key: "ticket_get", label: "TicketGet" },
  { key: "normalize", label: "Normalize" },
  { key: "db_dry_run", label: "Database dry run" }
] as const;

type DiagnosticStepDefinition = (typeof diagnosticStepDefinitions)[number];
export type DiagnosticStepKey = DiagnosticStepDefinition["key"];
export type DiagnosticStepStatus = "succeeded" | "warning" | "failed" | "skipped";
export type DiagnosticRunStatus = "succeeded" | "warning" | "failed";

type DiagnosticRunRecord = {
  id: string;
};

type DiagnosticStepRecord = {
  key: string;
  status: string;
};

type DiagnosticTx = {
  integrationDiagnosticRun: {
    create(args: {
      data: {
        workspaceId: string;
        integrationId: string;
        actorId?: string | null;
        status: string;
        mode: string;
        summaryJson?: string;
        redactedEndpoint?: string | null;
        errorCode?: string | null;
        errorMessage?: string | null;
      };
    }): Promise<DiagnosticRunRecord>;
    update(args: {
      where: { id: string };
      data: {
        status: string;
        finishedAt: Date;
        summaryJson: string;
        redactedEndpoint?: string | null;
        errorCode?: string | null;
        errorMessage?: string | null;
      };
    }): Promise<unknown>;
  };
  integrationDiagnosticStep: {
    create(args: {
      data: {
        diagnosticRunId: string;
        key: string;
        position: number;
        status: string;
        durationMs: number;
        detailJson: string;
        remediationHint?: string | null;
      };
    }): Promise<unknown>;
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
      select: {
        id: true;
      };
    }): Promise<{ id: string } | null>;
  };
};

type DiagnosticsIntegration = {
  id: string;
  workspaceId: string;
  source: string;
  displayName: string;
  type: string;
  baseUrl?: string | null;
  configJson: string;
};

type FirstRequestState =
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

type StepResult = {
  key: DiagnosticStepKey;
  status: DiagnosticStepStatus;
  detail?: unknown;
  remediationHint?: string;
  durationMs?: number;
};

type DiagnosticSummary = {
  searchedTicketIds: string[];
  fetchedTicketIds: string[];
  articleCountsByTicketId: Record<string, number>;
  normalizedConversationCount: number;
  duplicateCount: number;
  duplicates: Array<{
    externalSource: string;
    externalId: string;
    conversationId: string;
  }>;
};

export type RunOtrsDiagnosticsInput = {
  tx: DiagnosticTx;
  workspaceId: string;
  integrationId: string;
  actorId?: string | null;
  integration: DiagnosticsIntegration;
  userLogin?: string | null;
  password?: string | null;
  caBundle?: string | null;
  manualTicketId?: string | number | null;
  client?: Pick<OtrsHttpClient, "requestJson">;
};

export async function persistDiagnosticStep(
  tx: DiagnosticTx,
  input: {
    diagnosticRunId: string;
    key: DiagnosticStepKey;
    status: DiagnosticStepStatus;
    detail?: unknown;
    durationMs?: number;
    remediationHint?: string | null;
    redactionSecrets?: readonly string[];
  }
) {
  const position = diagnosticStepDefinitions.findIndex((step) => step.key === input.key);

  if (position < 0) {
    throw new Error(`Unknown OTRS diagnostic step: ${input.key}`);
  }

  return tx.integrationDiagnosticStep.create({
    data: {
      diagnosticRunId: input.diagnosticRunId,
      key: input.key,
      position,
      status: input.status,
      durationMs: Math.max(0, Math.round(input.durationMs ?? 0)),
      detailJson: JSON.stringify(sanitizeDiagnosticJson(input.detail ?? {}, input.redactionSecrets ?? [])),
      remediationHint: input.remediationHint ?? null
    }
  });
}

export function deriveDiagnosticStatus(steps: readonly DiagnosticStepRecord[]): DiagnosticRunStatus {
  if (steps.some((step) => step.status === "failed")) {
    return "failed";
  }

  if (steps.some((step) => step.status === "warning")) {
    return "warning";
  }

  return "succeeded";
}

export async function runOtrsDiagnostics(input: RunOtrsDiagnosticsInput) {
  const redactionSecrets = [input.userLogin, input.password, input.caBundle].filter(isPresentString);
  const mode = input.manualTicketId ? "manual_ticket_ids" : "ticket_search";
  const run = await input.tx.integrationDiagnosticRun.create({
    data: {
      workspaceId: input.workspaceId,
      integrationId: input.integrationId,
      actorId: input.actorId ?? null,
      status: "running",
      mode,
      summaryJson: "{}"
    }
  });
  const steps: StepResult[] = [];
  const summary: DiagnosticSummary = {
    searchedTicketIds: [],
    fetchedTicketIds: [],
    articleCountsByTicketId: {},
    normalizedConversationCount: 0,
    duplicateCount: 0,
    duplicates: []
  };
  let config: OtrsConnectorConfig | undefined;
  let redactedEndpoint: string | null = null;
  let firstRequest: FirstRequestState | undefined;
  let ticketGetPayload: unknown;
  let normalizedConversations: CustomConversationInput[] = [];
  let finalError: { code: OtrsConnectorErrorCode; message: string } | undefined;

  const record = async (step: StepResult) => {
    steps.push(step);
    await persistDiagnosticStep(input.tx, {
      diagnosticRunId: run.id,
      key: step.key,
      status: step.status,
      detail: step.detail,
      durationMs: step.durationMs,
      remediationHint: step.remediationHint,
      redactionSecrets
    });
  };

  const skipRemaining = async (startIndex: number, reason: string) => {
    for (let index = startIndex; index < diagnosticStepDefinitions.length; index += 1) {
      await record({
        key: diagnosticStepDefinitions[index].key,
        status: "skipped",
        detail: {
          reason
        }
      });
    }
  };

  try {
    const start = Date.now();
    config = parseOtrsConnectorConfig(input.integration.configJson);
    const baseUrl = requireBaseUrl(input.integration.baseUrl);
    redactedEndpoint = sanitizeDiagnosticString(
      redactOtrsUrl(
        buildOtrsWebServiceBaseUrl({
          baseUrl,
          basePath: config.basePath,
          webServiceName: config.webServiceName
        })
      ),
      redactionSecrets
    );
    await record({
      key: "config",
      status: "succeeded",
      durationMs: Date.now() - start,
      detail: {
        product: config.product,
        baseUrl: redactOtrsUrl(baseUrl),
        endpoint: redactedEndpoint,
        webServiceName: config.webServiceName
      }
    });
  } catch (error) {
    const diagnosticError = connectorErrorFromUnknown(error, "config_invalid", "OTRS diagnostic configuration is invalid.");
    finalError = {
      code: diagnosticError.code,
      message: diagnosticError.safeMessage
    };
    await record({
      key: "config",
      status: "failed",
      detail: diagnosticError.redactedDetail,
      remediationHint: diagnosticError.remediationHint
    });
    await skipRemaining(1, "config_failed");
    return finishRun();
  }

  const password = input.password ?? "";
  const passwordMissing = password.trim().length === 0;
  const userLogin = input.userLogin?.trim();
  const baseUrl = input.integration.baseUrl?.trim() ?? "";
  const protocol = protocolForBaseUrl(baseUrl);

  if (passwordMissing || !userLogin) {
    await record({
      key: "tls",
      status: "skipped",
      detail: {
        reason: passwordMissing ? "auth_password_missing" : "user_login_missing"
      }
    });
  } else if (protocol === "https:") {
    const start = Date.now();
    firstRequest = await executeFirstRequest({ input, config, baseUrl, userLogin, password });

    if (isConnectorErrorCode(firstRequest.error, "tls_failed")) {
      const diagnosticError = firstRequest.error;
      finalError = {
        code: diagnosticError.code,
        message: diagnosticError.safeMessage
      };
      await record({
        key: "tls",
        status: "failed",
        durationMs: Date.now() - start,
        detail: diagnosticError.redactedDetail,
        remediationHint: diagnosticError.remediationHint
      });
      await skipRemaining(2, "tls_failed");
      return finishRun();
    }

    await record({
      key: "tls",
      status: "succeeded",
      durationMs: Date.now() - start,
      detail: {
        protocol: "https",
        caBundleConfigured: Boolean(input.caBundle),
        firstRequestOperation: firstRequest.operation
      }
    });
  } else {
    await record({
      key: "tls",
      status: "succeeded",
      detail: {
        protocol: protocol.replace(":", "") || "unknown",
        caBundleConfigured: false
      }
    });
  }

  if (!firstRequest && !passwordMissing && userLogin) {
    firstRequest = await executeFirstRequest({ input, config, baseUrl, userLogin, password });
  }

  if (isConnectorErrorCode(firstRequest?.error, "webservice_unreachable") || isConnectorErrorCode(firstRequest?.error, "timeout")) {
    const diagnosticError = firstRequest.error;
    finalError = {
      code: diagnosticError.code,
      message: diagnosticError.safeMessage
    };
    await record({
      key: "webservice",
      status: "failed",
      detail: diagnosticError.redactedDetail,
      remediationHint: diagnosticError.remediationHint
    });
    await skipRemaining(3, "webservice_failed");
    return finishRun();
  }

  await record({
    key: "webservice",
    status: "succeeded",
    detail: {
      endpoint: redactedEndpoint
    }
  });

  if (passwordMissing || !userLogin) {
    const diagnosticError = new OtrsConnectorError({
      code: "secret_missing",
      safeMessage: "OTRS auth_password secret is missing.",
      redactedDetail: {
        missing: passwordMissing ? "auth_password" : "user_login"
      },
      remediationHint: "Save the OTRS API user password in the auth_password credential slot."
    });
    finalError = {
      code: diagnosticError.code,
      message: diagnosticError.safeMessage
    };
    await record({
      key: "auth",
      status: "failed",
      detail: diagnosticError.redactedDetail,
      remediationHint: diagnosticError.remediationHint
    });
    await skipRemaining(4, "auth_failed");
    return finishRun();
  }

  if (!firstRequest) {
    const diagnosticError = new OtrsConnectorError({
      code: "webservice_unreachable",
      safeMessage: "OTRS diagnostic request could not be started.",
      redactedDetail: {
        reason: "first_request_missing"
      }
    });
    finalError = {
      code: diagnosticError.code,
      message: diagnosticError.safeMessage
    };
    await record({
      key: "auth",
      status: "failed",
      detail: diagnosticError.redactedDetail,
      remediationHint: diagnosticError.remediationHint
    });
    await skipRemaining(4, "auth_failed");
    return finishRun();
  }

  const authenticatedFirstRequest = firstRequest;

  if (isConnectorErrorCode(authenticatedFirstRequest.error, "auth_failed")) {
    const diagnosticError = authenticatedFirstRequest.error;
    finalError = {
      code: diagnosticError.code,
      message: diagnosticError.safeMessage
    };
    await record({
      key: "auth",
      status: "failed",
      detail: diagnosticError.redactedDetail,
      remediationHint: diagnosticError.remediationHint
    });
    await skipRemaining(4, "auth_failed");
    return finishRun();
  }

  await record({
    key: "auth",
    status: "succeeded",
    detail: {
      authenticated: authenticatedFirstRequest.error ? "not_rejected" : true,
      firstRequestOperation: authenticatedFirstRequest.operation
    }
  });

  if (input.manualTicketId) {
    await record({
      key: "ticket_search",
      status: "skipped",
      detail: {
        reason: "manual_ticket_id_supplied"
      }
    });
  } else {
    const searchOutcome =
      authenticatedFirstRequest.operation === "ticket_search"
        ? authenticatedFirstRequest
        : await executeTicketSearch(input, config, baseUrl, userLogin, password);

    if (searchOutcome.error) {
      const diagnosticError = connectorErrorFromUnknown(
        searchOutcome.error,
        "ticket_search_failed",
        "OTRS TicketSearch request failed."
      );
      finalError = {
        code: diagnosticError.code,
        message: diagnosticError.safeMessage
      };
      await record({
        key: "ticket_search",
        status: "failed",
        detail: diagnosticError.redactedDetail,
        remediationHint: diagnosticError.remediationHint
      });
      await skipRemaining(5, "ticket_search_failed");
      return finishRun();
    }

    summary.searchedTicketIds = parseTicketSearchResponse(searchOutcome.result).slice(0, 1);
    await record({
      key: "ticket_search",
      status: summary.searchedTicketIds.length > 0 ? "succeeded" : "warning",
      detail: {
        limit: 1,
        ticketIds: summary.searchedTicketIds
      },
      remediationHint: summary.searchedTicketIds.length > 0 ? undefined : "Check OTRS queues, filters, and test data."
    });
  }

  const targetTicketId = input.manualTicketId ? String(input.manualTicketId) : summary.searchedTicketIds[0];

  if (!targetTicketId) {
    await record({
      key: "ticket_get",
      status: "skipped",
      detail: {
        reason: "no_ticket_id"
      }
    });
    await record({
      key: "normalize",
      status: "skipped",
      detail: {
        reason: "no_ticket_payload"
      }
    });
    await record({
      key: "db_dry_run",
      status: "skipped",
      detail: {
        reason: "no_normalized_conversation"
      }
    });
    return finishRun();
  }

  const getOutcome =
    authenticatedFirstRequest.operation === "ticket_get" && authenticatedFirstRequest.ticketId === targetTicketId
      ? authenticatedFirstRequest
      : await executeTicketGet(input, config, baseUrl, userLogin, password, targetTicketId);

  if (getOutcome.error) {
    const diagnosticError = connectorErrorFromUnknown(getOutcome.error, "ticket_get_failed", "OTRS TicketGet request failed.");
    finalError = {
      code: diagnosticError.code,
      message: diagnosticError.safeMessage
    };
    await record({
      key: "ticket_get",
      status: "failed",
      detail: diagnosticError.redactedDetail,
      remediationHint: diagnosticError.remediationHint
    });
    await skipRemaining(6, "ticket_get_failed");
    return finishRun();
  }

  ticketGetPayload = getOutcome.result;
  summary.fetchedTicketIds = [targetTicketId];
  await record({
    key: "ticket_get",
    status: "succeeded",
    detail: {
      ticketId: targetTicketId
    }
  });

  try {
    normalizedConversations = normalizeOtrsFamilyTicketGetResponse(ticketGetPayload as OtrsFamilyTicketGetResponse, {
      source: input.integration.source as OtrsFamilySource,
      baseUrl
    }).map((conversation) => customConversationSchema.parse(conversation));

    if (normalizedConversations.length === 0) {
      throw new Error("OTRS TicketGet response did not contain a normalizable ticket.");
    }

    summary.normalizedConversationCount = normalizedConversations.length;

    for (const conversation of normalizedConversations) {
      summary.articleCountsByTicketId[conversation.externalId] = conversation.messages.length;
    }

    await record({
      key: "normalize",
      status: "succeeded",
      detail: {
        conversationCount: normalizedConversations.length,
        articleCountsByTicketId: summary.articleCountsByTicketId
      }
    });
  } catch (error) {
    const diagnosticError = connectorErrorFromUnknown(error, "normalization_failed", "OTRS TicketGet normalization failed.");
    finalError = {
      code: diagnosticError.code,
      message: diagnosticError.safeMessage
    };
    await record({
      key: "normalize",
      status: "failed",
      detail: diagnosticError.redactedDetail,
      remediationHint: diagnosticError.remediationHint
    });
    await skipRemaining(7, "normalization_failed");
    return finishRun();
  }

  try {
    for (const conversation of normalizedConversations) {
      const duplicate = await input.tx.conversation.findUnique({
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

      if (duplicate) {
        summary.duplicates.push({
          externalSource: conversation.externalSource,
          externalId: conversation.externalId,
          conversationId: duplicate.id
        });
      }
    }

    summary.duplicateCount = summary.duplicates.length;
    await record({
      key: "db_dry_run",
      status: summary.duplicateCount > 0 ? "warning" : "succeeded",
      detail: {
        checkedCount: normalizedConversations.length,
        duplicateCount: summary.duplicateCount,
        duplicates: summary.duplicates
      },
      remediationHint: summary.duplicateCount > 0 ? "The diagnostic ticket already exists and would be deduplicated during import." : undefined
    });
  } catch (error) {
    const diagnosticError = connectorErrorFromUnknown(error, "db_dry_run_failed", "OTRS diagnostic database dry run failed.");
    finalError = {
      code: diagnosticError.code,
      message: diagnosticError.safeMessage
    };
    await record({
      key: "db_dry_run",
      status: "failed",
      detail: diagnosticError.redactedDetail,
      remediationHint: diagnosticError.remediationHint
    });
  }

  return finishRun();

  async function finishRun() {
    const status = deriveDiagnosticStatus(steps);
    return input.tx.integrationDiagnosticRun.update({
      where: { id: run.id },
      data: {
        status,
        finishedAt: new Date(),
        summaryJson: JSON.stringify(sanitizeDiagnosticJson(summary, redactionSecrets)),
        redactedEndpoint: redactedEndpoint ? sanitizeDiagnosticString(redactedEndpoint, redactionSecrets) : null,
        errorCode: finalError?.code ?? null,
        errorMessage: finalError?.message ? String(sanitizeDiagnosticJson(finalError.message, redactionSecrets)) : null
      }
    });
  }
}

async function executeFirstRequest(input: {
  input: RunOtrsDiagnosticsInput;
  config: OtrsConnectorConfig;
  baseUrl: string;
  userLogin?: string;
  password: string;
}): Promise<FirstRequestState> {
  if (input.input.manualTicketId) {
    return executeTicketGet(input.input, input.config, input.baseUrl, input.userLogin, input.password, String(input.input.manualTicketId));
  }

  return executeTicketSearch(input.input, input.config, input.baseUrl, input.userLogin, input.password);
}

async function executeTicketSearch(
  input: RunOtrsDiagnosticsInput,
  config: OtrsConnectorConfig,
  baseUrl: string,
  userLogin: string | undefined,
  password: string
): Promise<Extract<FirstRequestState, { operation: "ticket_search" }>> {
  try {
    const result = await requireClient(input.client).requestJson(
      buildTicketSearchRequest({
        config,
        baseUrl,
        userLogin: userLogin ?? "",
        password,
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

async function executeTicketGet(
  input: RunOtrsDiagnosticsInput,
  config: OtrsConnectorConfig,
  baseUrl: string,
  userLogin: string | undefined,
  password: string,
  ticketId: string
): Promise<Extract<FirstRequestState, { operation: "ticket_get" }>> {
  try {
    const result = await requireClient(input.client).requestJson(
      buildTicketGetRequest({
        config,
        baseUrl,
        userLogin: userLogin ?? "",
        password,
        ticketId,
        includeAttachments: false
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

function requireClient(client: RunOtrsDiagnosticsInput["client"]) {
  if (!client) {
    throw new OtrsConnectorError({
      code: "webservice_unreachable",
      safeMessage: "OTRS diagnostic HTTP client is not configured.",
      redactedDetail: {
        reason: "client_missing"
      }
    });
  }

  return client;
}

function requireBaseUrl(value: string | null | undefined) {
  const baseUrl = value?.trim();

  if (!baseUrl) {
    throw new OtrsConnectorError({
      code: "config_invalid",
      safeMessage: "OTRS Base URL is required for diagnostics.",
      redactedDetail: {
        field: "baseUrl"
      }
    });
  }

  try {
    new URL(baseUrl);
  } catch {
    throw new OtrsConnectorError({
      code: "config_invalid",
      safeMessage: "OTRS Base URL must be an absolute URL.",
      redactedDetail: {
        field: "baseUrl",
        value: redactOtrsUrl(baseUrl)
      }
    });
  }

  return baseUrl;
}

function protocolForBaseUrl(baseUrl: string) {
  try {
    return new URL(baseUrl).protocol;
  } catch {
    return "";
  }
}

function connectorErrorFromUnknown(error: unknown, code: OtrsConnectorErrorCode, safeMessage: string) {
  if (error instanceof OtrsConnectorError) {
    return error;
  }

  return new OtrsConnectorError({
    code,
    safeMessage: error instanceof Error && error.message ? error.message : safeMessage,
    redactedDetail: serializeUnknownError(error)
  });
}

function isConnectorErrorCode(error: unknown, code: OtrsConnectorErrorCode): error is OtrsConnectorError {
  return error instanceof OtrsConnectorError && error.code === code;
}

function serializeUnknownError(error: unknown) {
  if (!error || typeof error !== "object") {
    return {
      message: String(error)
    };
  }

  const record = error as Record<string, unknown>;
  const serialized: Record<string, unknown> = {};

  for (const key of Object.getOwnPropertyNames(error)) {
    serialized[key] = record[key];
  }

  if (error instanceof Error) {
    serialized.name = error.name;
    serialized.message = error.message;
  }

  return serialized;
}

function sanitizeDiagnosticJson(value: unknown, secrets: readonly string[] = []): unknown {
  return replaceKnownSecrets(redactOtrsPayload(value), secrets);
}

function sanitizeDiagnosticString(value: string, secrets: readonly string[] = []) {
  return String(sanitizeDiagnosticJson(value, secrets));
}

function replaceKnownSecrets(value: unknown, secrets: readonly string[]): unknown {
  const normalizedSecrets = Array.from(new Set(secrets.filter((secret) => secret.length > 0)));

  if (normalizedSecrets.length === 0) {
    return value;
  }

  if (typeof value === "string") {
    return normalizedSecrets.reduce((redacted, secret) => redacted.split(secret).join("[REDACTED]"), value);
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

function isPresentString(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}
