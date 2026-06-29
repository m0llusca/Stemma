"use server";

import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit";
import { assertCanPersistSettings, requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { messagingChannelRegistry } from "@/lib/messaging/registry";
import { encryptSecret } from "@/lib/secrets";

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
 */

export type SaveMessagingChannelState = {
  status: "idle" | "success" | "error";
  message?: string;
  kind?: string;
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
      message: "Неизвестный тип канала.",
      kind
    };
  }

  const definition = messagingChannelRegistry[kind];
  const webhookUrl = stringField(formData, "webhookUrl");
  const token = stringField(formData, "token");
  const requestedStatus = stringField(formData, "status");
  const status: MessagingChannelStatus = isChannelStatus(requestedStatus) ? requestedStatus : "draft";
  const displayName = stringField(formData, "displayName") || definition.displayName;

  // A channel cannot be deliverable without somewhere to deliver to.
  if (status === "active" && !webhookUrl) {
    return {
      status: "error",
      message: "Укажите webhook URL, чтобы активировать канал.",
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
        secretConfigured: Boolean(encryptedSecret) || undefined
      }
    });

    revalidatePath("/admin/system");

    return {
      status: "success",
      message:
        status === "active"
          ? "Канал сохранен и активирован."
          : "Канал сохранен как черновик.",
      kind
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Не удалось сохранить канал.",
      kind
    };
  }
}

export async function setMessagingChannelStatus(formData: FormData) {
  const user = await requireCurrentUserPermission("backend_jobs:manage");
  await assertCanPersistSettings(user);

  const kind = stringField(formData, "kind");
  const requestedStatus = stringField(formData, "status");

  if (!isKnownChannelKind(kind)) {
    throw new Error("Неизвестный тип канала.");
  }

  if (!isChannelStatus(requestedStatus)) {
    throw new Error("Недопустимый статус канала.");
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
      status: requestedStatus
    }
  });

  revalidatePath("/admin/system");
}
