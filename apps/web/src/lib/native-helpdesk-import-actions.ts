"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditLog } from "@/lib/audit";
import { upsertCustomConversation } from "@/lib/conversation-import";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import {
  nativeHelpdeskSources,
  normalizeNativeHelpdeskPayload,
  type NativeHelpdeskNormalizeOptions,
  type NativeHelpdeskSource
} from "@/lib/normalizers/native-helpdesk";
import { customConversationSchema } from "@/lib/validation/custom-api";

const nativeHelpdeskSourceValues = nativeHelpdeskSources.map((source) => source.value);

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalStringField(formData: FormData, key: string) {
  const value = stringField(formData, key);
  return value ? value : undefined;
}

function sourceField(formData: FormData): NativeHelpdeskSource {
  const source = stringField(formData, "source");

  if (!nativeHelpdeskSourceValues.includes(source as NativeHelpdeskSource)) {
    throw new Error("Некорректный источник helpdesk.");
  }

  return source as NativeHelpdeskSource;
}

function parseNativePayload(rawPayload: string, options: NativeHelpdeskNormalizeOptions) {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawPayload);
  } catch {
    throw new Error("Payload должен быть валидным JSON.");
  }

  const conversations = normalizeNativeHelpdeskPayload(parsed, options).map((conversation) =>
    customConversationSchema.parse(conversation)
  );

  if (conversations.length === 0) {
    throw new Error("Не найден поддерживаемый ticket/conversation payload.");
  }

  return conversations;
}

async function recordIntegrationSync(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  source: NativeHelpdeskSource
) {
  const sourceConfig = nativeHelpdeskSources.find((item) => item.value === source);
  const existingIntegration = await tx.integration.findFirst({
    where: {
      workspaceId,
      source
    },
    select: {
      id: true
    }
  });
  const data = {
    displayName: sourceConfig?.label ?? source,
    status: "active",
    lastSyncedAt: new Date()
  };

  if (existingIntegration) {
    await tx.integration.update({
      where: { id: existingIntegration.id },
      data
    });
    return;
  }

  await tx.integration.create({
    data: {
      workspaceId,
      source,
      ...data
    }
  });
}

export async function importNativeHelpdeskPayload(formData: FormData) {
  const user = await getCurrentUser();
  const source = sourceField(formData);
  const rawPayload = stringField(formData, "payload");

  if (!rawPayload) {
    throw new Error("Вставьте данные из helpdesk.");
  }

  const options: NativeHelpdeskNormalizeOptions = {
    source,
    baseUrl: optionalStringField(formData, "baseUrl"),
    samplingReason: optionalStringField(formData, "samplingReason")
  };
  const conversations = parseNativePayload(rawPayload, options);

  const imported = await prisma.$transaction(async (tx) => {
    const rows = [];

    for (const conversation of conversations) {
      rows.push(await upsertCustomConversation(user.workspaceId, conversation, tx));
    }

    await recordIntegrationSync(tx, user.workspaceId, source);

    await auditLog(
      {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "integration.native_helpdesk_imported",
        targetType: "integration",
        targetId: source,
        metadata: {
          source,
          count: rows.length,
          externalIds: rows.map((row) => row.externalId),
          baseUrl: options.baseUrl
        }
      },
      tx
    );

    return rows;
  });

  revalidatePath("/admin/integrations");
  revalidatePath("/reviews");
  redirect(`/reviews?source=${encodeURIComponent(source)}&q=${encodeURIComponent(imported[0]?.externalId ?? "")}`);
}
