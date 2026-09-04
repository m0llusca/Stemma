"use server";

import { auditLog } from "@/lib/audit";
import { canManageIntegrations, getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import {
  upsertIntegrationSecretSlot,
  type OtrsCredentialKind
} from "@/lib/integrations/otrs-family/credentials";
import { getConnectionProfile } from "@/lib/integrations/connect/profiles";
import { runConnectPipeline } from "@/lib/integrations/connect/orchestrator";
import { connectionSourceLabel } from "@/lib/integrations/connect/source-labels";
import type {
  ConnectStepStatus,
  SourceConnectionProfile
} from "@/lib/integrations/connect/types";

export type ConnectJournalState =
  | {
      steps: Array<{
        step: string;
        status: ConnectStepStatus;
        detail?: string;
        hint?: string;
        diagnostics?: Record<string, unknown>;
      }>;
      connected: boolean;
      integrationId?: string;
    }
  | { error: string }
  | null;

function stringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

// Лёгкая проверка доступности: один GET с жёстким таймаутом. Любой HTTP-ответ
// (включая 4xx/5xx) означает, что сервер жив — это всё, что нужно reachability.
// Сетевая ошибка/таймаут трактуются как недоступность.
async function defaultReachabilityCheck(
  baseUrl: string
): Promise<{ status: ConnectStepStatus; detail?: string; hint?: string }> {
  try {
    const response = await fetch(baseUrl, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(8000)
    });
    return { status: "ok", detail: productFromHeaders(response) };
  } catch {
    return {
      status: "failed",
      detail: "Сервер не ответил.",
      hint: "Проверьте адрес или firewall."
    };
  }
}

// Извлекает имя/версию продукта из заголовка x-powered-by, если сервер его
// прислал (например, "OTRS 6.0.10"). Иначе — нейтральный detail.
function productFromHeaders(response: Response): string {
  const poweredBy = response.headers.get("x-powered-by");
  if (poweredBy && poweredBy.trim()) {
    return `Сервер ответил (${poweredBy.trim()}).`;
  }
  return "Сервер ответил.";
}

async function persistIntegration(args: {
  profile: SourceConnectionProfile;
  baseUrl: string;
  authMode: string;
  config: Record<string, unknown>;
  secretSlots: Array<{ kind: string; secret: string }>;
  workspaceId: string;
  actorId: string;
}): Promise<{ integrationId: string }> {
  const { profile, baseUrl, authMode, config, secretSlots, workspaceId, actorId } = args;

  return prisma.$transaction(async (tx) => {
    const integration = await tx.integration.upsert({
      where: {
        workspaceId_source: {
          workspaceId,
          source: profile.source
        }
      },
      create: {
        workspaceId,
        source: profile.source,
        displayName: connectionSourceLabel(profile.source),
        type: profile.type,
        status: "active",
        baseUrl,
        authMode,
        configJson: JSON.stringify(config)
      },
      update: {
        displayName: connectionSourceLabel(profile.source),
        type: profile.type,
        status: "active",
        baseUrl,
        authMode,
        configJson: JSON.stringify(config),
        lastError: null
      }
    });

    for (const slot of secretSlots) {
      await upsertIntegrationSecretSlot(tx, {
        workspaceId,
        integrationId: integration.id,
        kind: slot.kind as OtrsCredentialKind,
        authMode,
        secret: slot.secret
      });
    }

    await auditLog(
      {
        workspaceId,
        actorId,
        action: "integration.connected",
        targetType: "integration",
        targetId: integration.id,
        metadata: { source: profile.source, type: profile.type }
      },
      tx
    );

    return { integrationId: integration.id };
  });
}

export async function connectSourceAction(
  _prev: ConnectJournalState,
  formData: FormData
): Promise<ConnectJournalState> {
  const user = await getCurrentUser();

  if (!canManageIntegrations(user.role)) {
    return { error: "Недостаточно прав для подключения источника." };
  }

  const source = stringField(formData, "source");
  const profile = getConnectionProfile(source);

  if (!profile) {
    return { error: "Неизвестный источник." };
  }

  const rawUrl =
    profile.urlPolicy === "fixed" && profile.fixedBaseUrl
      ? profile.fixedBaseUrl
      : stringField(formData, "baseUrl");

  const credentials: Record<string, string> = {};
  for (const field of profile.credentialFields) {
    credentials[field.key] = stringField(formData, field.key);
  }

  const testTicketId = stringField(formData, "testTicketId") || undefined;

  const journal = await runConnectPipeline({
    profile,
    rawUrl,
    credentials,
    testTicketId,
    workspaceId: user.workspaceId,
    actorId: user.id,
    reachabilityCheck: defaultReachabilityCheck,
    persist: persistIntegration
  });

  return journal;
}
