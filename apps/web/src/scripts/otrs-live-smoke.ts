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

type SmokeStepStatus = "succeeded" | "failed" | "skipped";

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

const redactedValue = "[REDACTED]";

async function main() {
  if (process.env.OTRS_LIVE_SMOKE !== "1") {
    throw new Error("Refusing to run live OTRS smoke: set OTRS_LIVE_SMOKE=1 to acknowledge live OTRS access.");
  }

  const steps: SmokeStep[] = [];
  const runtime = await recordStep(steps, "config", buildRuntime);
  let preview: PreviewResult | undefined;
  let importResult: unknown = {
    status: "skipped",
    reason: "preview_failed"
  };
  let finalError: unknown;

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

  const failedStep = steps.find((step) => step.status === "failed");
  const failed = Boolean(failedStep || finalError);
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
