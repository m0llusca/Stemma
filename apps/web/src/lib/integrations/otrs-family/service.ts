import type { IntegrationCredential } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createOtrsHttpClient, type OtrsHttpClient } from "@/lib/integrations/otrs-family/client";
import { parseOtrsConnectorConfig } from "@/lib/integrations/otrs-family/config";
import {
  decryptIntegrationSecretSlot,
  getIntegrationSecretSlots
} from "@/lib/integrations/otrs-family/credentials";
import { runOtrsDiagnostics } from "@/lib/integrations/otrs-family/diagnostics";

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

  const secretSlots = await getIntegrationSecretSlots(db, integration.id);
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
