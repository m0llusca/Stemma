"use server";

import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit";
import { isAiCredentialProvider, type AiCredentialProvider } from "@/lib/ai-quality/credentials";
import { assertCanPersistSettings, requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { encryptSecret } from "@/lib/secrets";

/**
 * Admin surface for AI provider API keys (set on /admin/ai-scoring). Gated behind
 * the same `backend_jobs:manage` permission + demo guard as the other settings
 * writes. The raw key is encrypted via encryptSecret before it touches the DB and
 * is never written to logs or audit metadata. Non-secret extras (catalog id /
 * model / organization) are stored in configJson. Leaving the key field blank on
 * update keeps the stored key; the "clear" flag removes the credential entirely.
 */
export type SaveAiProviderCredentialState = {
  status: "idle" | "success" | "error";
  message?: string;
  provider?: string;
};

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function buildConfigJson(provider: AiCredentialProvider, formData: FormData): string {
  const config: Record<string, string> = {};
  const model = stringField(formData, "model");

  if (provider === "yandexgpt") {
    const catalogId = stringField(formData, "catalogId");
    if (catalogId) config.catalogId = catalogId;
    if (model) config.model = model;
  } else if (provider === "anthropic") {
    if (model) config.model = model;
  } else if (provider === "openai") {
    const organization = stringField(formData, "organization");
    if (model) config.model = model;
    if (organization) config.organization = organization;
  }

  return JSON.stringify(config);
}

export async function saveAiProviderCredential(
  _previousState: SaveAiProviderCredentialState,
  formData: FormData
): Promise<SaveAiProviderCredentialState> {
  const user = await requireCurrentUserPermission("backend_jobs:manage");
  await assertCanPersistSettings(user);

  const provider = stringField(formData, "provider");
  if (!isAiCredentialProvider(provider)) {
    return { status: "error", message: "Неизвестный провайдер AI.", provider };
  }

  const clear = stringField(formData, "clear") === "1";

  try {
    if (clear) {
      await prisma.aiProviderCredential.deleteMany({
        where: { workspaceId: user.workspaceId, provider }
      });

      await auditLog({
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "ai_provider_credential.cleared",
        targetType: "ai_provider_credential",
        targetId: provider,
        metadata: { provider }
      });

      revalidatePath("/admin/ai-scoring");
      revalidatePath("/admin");
      return { status: "success", message: "Ключ провайдера удалён.", provider };
    }

    const apiKey = stringField(formData, "apiKey");
    const configJson = buildConfigJson(provider, formData);
    const encryptedSecret = apiKey ? encryptSecret(apiKey) : undefined;

    await prisma.aiProviderCredential.upsert({
      where: { workspaceId_provider: { workspaceId: user.workspaceId, provider } },
      create: {
        workspaceId: user.workspaceId,
        provider,
        configJson,
        secretRef: encryptedSecret ?? null
      },
      update: {
        configJson,
        // Only overwrite the stored key when a fresh one was supplied, so saving
        // extras (catalog id / model) alone does not wipe an existing key.
        ...(encryptedSecret ? { secretRef: encryptedSecret } : {})
      }
    });

    await auditLog({
      workspaceId: user.workspaceId,
      actorId: user.id,
      action: "ai_provider_credential.saved",
      targetType: "ai_provider_credential",
      targetId: provider,
      // Record only whether a key is present — never the key itself.
      metadata: { provider, keyConfigured: Boolean(encryptedSecret) || undefined }
    });

    revalidatePath("/admin/ai-scoring");
    revalidatePath("/admin");
    return {
      status: "success",
      message: encryptedSecret ? "Ключ сохранён." : "Настройки провайдера сохранены.",
      provider
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Не удалось сохранить ключ.",
      provider
    };
  }
}
