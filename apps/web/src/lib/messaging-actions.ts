"use server";

import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit";
import { assertCanPersistSettings, requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import {
  isProbeBeforeSaveAllowed,
  probeBeforeSaveGate,
  type ProbeBeforeSaveIntent
} from "@/lib/integrations/probe-honesty";
import { probeMessagingChannelWebhook } from "@/lib/messaging/probe-channel";
import { messagingChannelRegistry } from "@/lib/messaging/registry";
import { assertPublicBaseUrl } from "@/lib/net-guard";
import { encryptSecret } from "@/lib/secrets";
import type { StatusTone } from "@/lib/ui/status-tone";

/**
 * Admin surface for messaging channels (W6-C). Both actions are gated behind the
 * same `backend_jobs:manage` permission + demo guard the rest of /admin/system
 * uses (see system-actions.ts). The raw token is encrypted via encryptSecret
 * before it ever reaches the database and is never written to logs or audit
 * metadata.
 *
 * Storage convention (shared across workstreams):
 * - configJson  = JSON.stringify({ webhookUrl })
 * - secretRef   = encryptSecret(token) | null
 * - status      = "active" (deliverable) | "draft" (not)
 *
 * Activate / claim_live: probe runs BEFORE persist; `decision.action === "block"`
 * aborts the write (fail-closed). Operational enable is not live certification.
 */

export type SaveMessagingChannelState = {
  status: "idle" | "success" | "error";
  message?: string;
  kind?: string;
  tone?: StatusTone;
};

const MESSAGING_CHANNEL_STATUSES = ["active", "draft"] as const;
type MessagingChannelStatus = (typeof MESSAGING_CHANNEL_STATUSES)[number];

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function isKnownChannelKind(kind: string): kind is keyof typeof messagingChannelRegistry {
  return Object.prototype.hasOwnProperty.call(messagingChannelRegistry, kind);
}

function isChannelStatus(value: string): value is MessagingChannelStatus {
  return (MESSAGING_CHANNEL_STATUSES as readonly string[]).includes(value);
}

function isLikelyWebhookUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function parseStoredWebhookUrl(configJson: string | null | undefined): string {
  if (!configJson) {
    return "";
  }

  try {
    const parsed = JSON.parse(configJson) as { webhookUrl?: unknown };
    return typeof parsed.webhookUrl === "string" ? parsed.webhookUrl.trim() : "";
  } catch {
    return "";
  }
}

/**
 * Resolve honesty intent. `claimLive=1` asserts live-ready (blocked without cert).
 * Otherwise active → activate, draft → config_only.
 */
function resolveMessagingSaveIntent(
  status: MessagingChannelStatus,
  formData: FormData
): ProbeBeforeSaveIntent {
  const claimLive = stringField(formData, "claimLive");
  if (claimLive === "1" || claimLive === "true") {
    return "claim_live";
  }

  return status === "active" ? "activate" : "config_only";
}

/**
 * Probe + gate BEFORE any activate/claim_live persist. Returns a block state when
 * the probe fails or the gate blocks; otherwise evidence for the success message.
 */
async function gateMessagingLiveIntent(input: {
  intent: ProbeBeforeSaveIntent;
  kind: string;
  webhookUrl: string;
  liveCertified?: boolean;
}): Promise<
  | { blocked: true; state: SaveMessagingChannelState }
  | {
      blocked: false;
      decision: ReturnType<typeof probeBeforeSaveGate>;
      probeSucceeded: boolean;
      liveCertified: boolean;
    }
> {
  const liveCertified = Boolean(input.liveCertified);
  let probeSucceeded = false;

  if (input.intent === "activate" || input.intent === "claim_live") {
    if (!liveCertified) {
      const probe = await probeMessagingChannelWebhook({
        kind: input.kind,
        webhookUrl: input.webhookUrl
      });
      probeSucceeded = probe.ok;

      if (!probe.ok) {
        const decision = probeBeforeSaveGate(input.intent, {
          probeSucceeded: false,
          liveCertified: false
        });
        return {
          blocked: true,
          state: {
            status: "error",
            message: probe.error ?? decision.message,
            kind: input.kind,
            tone: decision.tone
          }
        };
      }
    } else {
      // Live cert already covers readiness; skip network probe.
      probeSucceeded = true;
    }
  }

  const decision = probeBeforeSaveGate(input.intent, { probeSucceeded, liveCertified });

  if (!isProbeBeforeSaveAllowed(decision)) {
    return {
      blocked: true,
      state: {
        status: "error",
        message: decision.message,
        kind: input.kind,
        tone: decision.tone
      }
    };
  }

  return { blocked: false, decision, probeSucceeded, liveCertified };
}

export async function saveMessagingChannel(
  _previousState: SaveMessagingChannelState,
  formData: FormData
): Promise<SaveMessagingChannelState> {
  const user = await requireCurrentUserPermission("backend_jobs:manage");
  await assertCanPersistSettings(user);

  const kind = stringField(formData, "kind");

  if (!isKnownChannelKind(kind)) {
    return {
      status: "error",
      message: "Неизвестный тип уведомления.",
      kind
    };
  }

  const definition = messagingChannelRegistry[kind];
  const webhookUrl = stringField(formData, "webhookUrl");
  const token = stringField(formData, "token");
  const requestedStatus = stringField(formData, "status");
  const status: MessagingChannelStatus = isChannelStatus(requestedStatus) ? requestedStatus : "draft";
  const displayName = stringField(formData, "displayName") || definition.displayName;
  const intent = resolveMessagingSaveIntent(status, formData);

  // A channel cannot be deliverable without somewhere to deliver to.
  if ((status === "active" || intent === "claim_live") && !webhookUrl) {
    return {
      status: "error",
      message: "Укажите webhook URL, чтобы включить уведомление.",
      kind
    };
  }

  if (webhookUrl && !isLikelyWebhookUrl(webhookUrl)) {
    return {
      status: "error",
      message: "Webhook URL должен быть корректной ссылкой https://.",
      kind
    };
  }

  if (webhookUrl) {
    try {
      await assertPublicBaseUrl(new URL(webhookUrl));
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Webhook URL недопустим.",
        kind
      };
    }
  }

  // Probe-before-save: activate/claim_live must pass the gate BEFORE upsert.
  if (intent === "activate" || intent === "claim_live") {
    const gated = await gateMessagingLiveIntent({
      intent,
      kind,
      webhookUrl
    });
    if (gated.blocked) {
      return gated.state;
    }
  }

  const configJson = JSON.stringify({ webhookUrl });
  const capabilities = JSON.stringify(definition.capabilities);
  const encryptedSecret = token ? encryptSecret(token) : null;

  try {
    const channel = await prisma.messagingChannel.upsert({
      where: {
        workspaceId_kind: {
          workspaceId: user.workspaceId,
          kind
        }
      },
      create: {
        workspaceId: user.workspaceId,
        kind,
        displayName,
        status,
        capabilities,
        configJson,
        secretRef: encryptedSecret
      },
      update: {
        displayName,
        status,
        capabilities,
        configJson,
        // Only overwrite the stored secret when a fresh token was supplied,
        // so saving the webhook alone does not wipe an existing credential.
        ...(encryptedSecret ? { secretRef: encryptedSecret } : {})
      }
    });

    await auditLog({
      workspaceId: user.workspaceId,
      actorId: user.id,
      action: "messaging_channel.saved",
      targetType: "messaging_channel",
      targetId: channel.id,
      metadata: {
        kind: channel.kind,
        status: channel.status,
        hasWebhook: Boolean(webhookUrl),
        // Record only whether a secret is present — never the secret itself.
        secretConfigured: Boolean(encryptedSecret) || undefined,
        intent
      }
    });

    revalidatePath("/admin/channels");
    revalidatePath("/admin");

    const decision =
      intent === "activate" || intent === "claim_live"
        ? probeBeforeSaveGate(intent, { probeSucceeded: true, liveCertified: false })
        : probeBeforeSaveGate("config_only");

    return {
      status: "success",
      message:
        status === "active"
          ? `Уведомление сохранено и включено для доставки. ${decision.message}`
          : `Уведомление сохранено как черновик. ${decision.message}`,
      kind,
      tone: decision.tone
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Не удалось сохранить уведомление.",
      kind
    };
  }
}

export async function setMessagingChannelStatus(
  _previousState: SaveMessagingChannelState,
  formData: FormData
): Promise<SaveMessagingChannelState> {
  const user = await requireCurrentUserPermission("backend_jobs:manage");
  await assertCanPersistSettings(user);

  const kind = stringField(formData, "kind");
  const requestedStatus = stringField(formData, "status");
  const intent = resolveMessagingSaveIntent(
    isChannelStatus(requestedStatus) ? requestedStatus : "draft",
    formData
  );

  if (!isKnownChannelKind(kind)) {
    throw new Error("Неизвестный тип уведомления.");
  }

  if (!isChannelStatus(requestedStatus)) {
    throw new Error("Недопустимый статус уведомления.");
  }

  if (requestedStatus === "active" || intent === "claim_live") {
    const existing = await prisma.messagingChannel.findUnique({
      where: {
        workspaceId_kind: {
          workspaceId: user.workspaceId,
          kind
        }
      },
      select: {
        configJson: true
      }
    });
    const webhookUrl = parseStoredWebhookUrl(existing?.configJson);

    if (!webhookUrl) {
      return {
        status: "error",
        message: "Укажите webhook URL, чтобы включить уведомление.",
        kind,
        tone: "negative"
      };
    }

    const gated = await gateMessagingLiveIntent({
      intent: intent === "claim_live" ? "claim_live" : "activate",
      kind,
      webhookUrl
    });
    if (gated.blocked) {
      return gated.state;
    }
  }

  const channel = await prisma.messagingChannel.update({
    where: {
      workspaceId_kind: {
        workspaceId: user.workspaceId,
        kind
      }
    },
    data: {
      status: requestedStatus
    }
  });

  await auditLog({
    workspaceId: user.workspaceId,
    actorId: user.id,
    action: "messaging_channel.status_changed",
    targetType: "messaging_channel",
    targetId: channel.id,
    metadata: {
      kind: channel.kind,
      status: requestedStatus,
      intent
    }
  });

  revalidatePath("/admin/channels");
  revalidatePath("/admin");

  if (requestedStatus === "active" || intent === "claim_live") {
    const decision = probeBeforeSaveGate(intent === "claim_live" ? "claim_live" : "activate", {
      probeSucceeded: true,
      liveCertified: false
    });
    return {
      status: "success",
      message: `Уведомление включено для доставки. ${decision.message}`,
      kind,
      tone: decision.tone
    };
  }

  return {
    status: "success",
    message: "Уведомление переведено в черновик.",
    kind,
    tone: "neutral"
  };
}
