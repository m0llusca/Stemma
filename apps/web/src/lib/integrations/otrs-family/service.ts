import type { IntegrationCredential } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createOtrsHttpClient, type OtrsHttpClient } from "@/lib/integrations/otrs-family/client";
import { parseOtrsConnectorConfig } from "@/lib/integrations/otrs-family/config";
import {
  decryptIntegrationSecretSlot,
  getIntegrationSecretSlots
} from "@/lib/integrations/otrs-family/credentials";
import { runOtrsDiagnostics } from "@/lib/integrations/otrs-family/diagnostics";
import { createOtrsPreviewRun, type CreateOtrsPreviewRunInput } from "@/lib/integrations/otrs-family/import-plan";
import { recordOtrsCertificationRun } from "@/lib/integrations/otrs-family/certification";

type DiagnosticsServiceDb = {
  integration: {
    findFirst(args: {
      where: {
        id: string;
        workspaceId: string;
      };
      include: {
        credentials: true;
      };
    }): Promise<{
      id: string;
      workspaceId: string;
      source: string;
      displayName: string;
      type: string;
      baseUrl: string | null;
      configJson: string;
      credentials?: IntegrationCredential[];
    } | null>;
  };
  integrationCredential: Parameters<typeof getIntegrationSecretSlots>[0]["integrationCredential"];
} & Parameters<typeof runOtrsDiagnostics>[0]["tx"];

export type RunOtrsConnectorDiagnosticsInput = {
  workspaceId: string;
  integrationId: string;
  actorId?: string | null;
  manualTicketId?: string | number | null;
  db?: DiagnosticsServiceDb;
  client?: Pick<OtrsHttpClient, "requestJson">;
};

type PreviewServiceDb = DiagnosticsServiceDb & NonNullable<CreateOtrsPreviewRunInput["db"]>;

export type CreateOtrsPreviewInput = {
  workspaceId: string;
  integrationId: string;
  actorId?: string | null;
  db?: PreviewServiceDb;
  client?: Pick<OtrsHttpClient, "requestJson">;
} & (
  | {
      mode: "manual_ticket_ids";
      manualTicketIds: Array<string | number>;
    }
  | {
      mode: "ticket_search";
      filters?: Record<string, unknown>;
    }
);

export async function runOtrsConnectorDiagnostics(input: RunOtrsConnectorDiagnosticsInput) {
  const db = input.db ?? prisma;
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
    throw new Error("OTRS integration was not found in the requested workspace.");
  }

  const secretSlots = await getIntegrationSecretSlots(db, {
    workspaceId: input.workspaceId,
    integrationId: integration.id
  });
  const authPassword = decryptIntegrationSecretSlot(secretSlots, "auth_password");
  const caBundle = decryptIntegrationSecretSlot(secretSlots, "ca_bundle");
  const diagnosticClient = input.client ?? createDiagnosticClient(integration, authPassword, caBundle);

  return runOtrsDiagnostics({
    tx: db,
    workspaceId: input.workspaceId,
    integrationId: input.integrationId,
    actorId: input.actorId,
    manualTicketId: input.manualTicketId,
    integration,
    userLogin: parseUserLogin(integration.configJson),
    password: authPassword,
    caBundle,
    client: diagnosticClient
  });
}

export async function createOtrsPreview(input: CreateOtrsPreviewInput) {
  const db = input.db ?? prisma;
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
    throw new Error("OTRS integration was not found in the requested workspace.");
  }

  const secretSlots = await getIntegrationSecretSlots(db, {
    workspaceId: input.workspaceId,
    integrationId: integration.id
  });
  const config = parseOtrsConnectorConfig(integration.configJson);
  const userLogin = parseUserLogin(integration.configJson);
  const password = decryptIntegrationSecretSlot(secretSlots, "auth_password");
  const caBundle = decryptIntegrationSecretSlot(secretSlots, "ca_bundle");

  if (!integration.baseUrl) {
    throw new Error("OTRS integration base URL is not configured.");
  }

  if (!userLogin) {
    throw new Error("OTRS integration user login is not configured.");
  }

  if (!password) {
    throw new Error("OTRS integration auth secret is not configured.");
  }

  const client =
    input.client ??
    createOtrsHttpClient({
      config,
      baseUrl: integration.baseUrl,
      userLogin,
      password,
      caBundle
    });
  const common = {
    db,
    client,
    workspaceId: input.workspaceId,
    integration: {
      id: integration.id,
      source: integration.source,
      baseUrl: integration.baseUrl,
      config
    },
    actorId: input.actorId,
    userLogin,
    password
  };

  return input.mode === "manual_ticket_ids"
    ? createOtrsPreviewRun({
        ...common,
        mode: input.mode,
        manualTicketIds: input.manualTicketIds
      })
    : createOtrsPreviewRun({
        ...common,
        mode: input.mode,
        filters: input.filters
    });
}

export function summarizeOtrsCertificationInput(input: {
  source: "otrs" | "znuny" | "otobo";
  routeDetected: boolean;
  authOk: boolean;
  ticketSearchOk: boolean;
  webhookOk: boolean;
  pollingFallbackAcknowledged?: boolean;
  imported: number;
  skipped: number;
}) {
  return {
    source: input.source,
    diagnostics: {
      routeDetected: input.routeDetected,
      authOk: input.authOk,
      ticketSearchOk: input.ticketSearchOk,
      webhookOk: input.webhookOk,
      pollingFallbackAcknowledged: Boolean(input.pollingFallbackAcknowledged)
    },
    sampleImport: {
      imported: input.imported,
      skipped: input.skipped
    }
  };
}

function stepSucceeded(steps: Array<{ key: string; status: string }>, key: string) {
  return steps.some((step) => step.key === key && (step.status === "succeeded" || step.status === "warning"));
}

function asOtrsFamilySource(source: string): "otrs" | "znuny" | "otobo" {
  if (source === "znuny" || source === "otobo" || source === "otrs") {
    return source;
  }
  return "otrs";
}

/**
 * Persist a live-cert run from diagnostic steps + optional preview import counts.
 * Fail-closed: webhookOk only when this integration has an active webhook.
 * Polling-only never sets webhookOk — that would print «Webhook подтвержден».
 */
export async function recordOtrsCertificationFromEvidence(input: {
  workspaceId: string;
  integrationId: string;
  actorId: string;
  diagnosticRunId: string;
  imported?: number;
  skipped?: number;
}) {
  const [integration, steps, webhookCount] = await Promise.all([
    prisma.integration.findFirst({
      where: { id: input.integrationId, workspaceId: input.workspaceId },
      select: { id: true, source: true, configJson: true }
    }),
    prisma.integrationDiagnosticStep.findMany({
      where: { diagnosticRunId: input.diagnosticRunId },
      select: { key: true, status: true }
    }),
    prisma.webhookEndpoint.count({
      where: {
        workspaceId: input.workspaceId,
        integrationId: input.integrationId,
        status: "active"
      }
    })
  ]);

  if (!integration) {
    throw new Error("OTRS integration was not found in the requested workspace.");
  }

  const config = parseOtrsConnectorConfig(integration.configJson);
  const certInput = summarizeOtrsCertificationInput({
    source: asOtrsFamilySource(integration.source),
    routeDetected: stepSucceeded(steps, "config") || stepSucceeded(steps, "webservice"),
    authOk: stepSucceeded(steps, "auth"),
    ticketSearchOk: stepSucceeded(steps, "ticket_search") || stepSucceeded(steps, "ticket_get"),
    webhookOk: webhookCount > 0,
    pollingFallbackAcknowledged: Boolean(config.advanced.pollingFallbackAcknowledged),
    imported: input.imported ?? 0,
    skipped: input.skipped ?? 0
  });

  return recordOtrsCertificationRun({
    workspaceId: input.workspaceId,
    integrationId: input.integrationId,
    actorId: input.actorId,
    ...certInput
  });
}

function createDiagnosticClient(
  integration: {
    baseUrl: string | null;
    configJson: string;
  },
  authPassword: string | undefined,
  caBundle: string | undefined
) {
  if (!authPassword || !integration.baseUrl) {
    return undefined;
  }

  try {
    const config = parseOtrsConnectorConfig(integration.configJson);
    const userLogin = parseUserLogin(integration.configJson);

    if (!userLogin) {
      return undefined;
    }

    return createOtrsHttpClient({
      config,
      baseUrl: integration.baseUrl,
      userLogin,
      password: authPassword,
      caBundle
    });
  } catch {
    return undefined;
  }
}

function parseUserLogin(configJson: string) {
  try {
    const parsed = JSON.parse(configJson) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }

    const value = (parsed as Record<string, unknown>).userLogin;
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  } catch {
    return undefined;
  }
}
