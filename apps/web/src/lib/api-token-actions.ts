"use server";

import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit";
import { createApiToken, revokeApiToken } from "@/lib/api-token-service";
import { assertCanPersistSettings, requireCurrentUserPermission } from "@/lib/current-user";

export type CreateApiTokenState = {
  status: "idle" | "success" | "error";
  message?: string;
  plainToken?: string;
  tokenName?: string;
  tokenPrefix?: string;
  scopes?: string[];
};

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function stringListField(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
}

function parseExpiresAt(value: string) {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T23:59:59.999`);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Некорректная дата истечения токена.");
  }

  return parsed;
}

export async function createApiTokenFromForm(
  _previousState: CreateApiTokenState,
  formData: FormData
): Promise<CreateApiTokenState> {
  const user = await requireCurrentUserPermission("api_tokens:manage");
  const name = stringField(formData, "name");
  const scopes = stringListField(formData, "scopes");
  const expiresAt = stringField(formData, "expiresAt");

  if (name.length < 2) {
    return {
      status: "error",
      message: "Название API-ключа должно быть не короче двух символов."
    };
  }

  try {
    // Внутри try: демо-гейт должен показать инлайн-ошибку формы,
    // а не ронять страницу в error boundary.
    await assertCanPersistSettings(user);
    const created = await createApiToken({
      workspaceId: user.workspaceId,
      name,
      scopes,
      expiresAt: parseExpiresAt(expiresAt)
    });

    await auditLog({
      workspaceId: user.workspaceId,
      actorId: user.id,
      action: "api_token.created",
      targetType: "api_token",
      targetId: created.token.id,
      metadata: {
        name: created.token.name,
        tokenPrefix: created.token.tokenPrefix,
        scopes: created.token.scopes,
        expiresAt: created.token.expiresAt
      }
    });

    revalidatePath("/admin/tokens");
    revalidatePath("/admin/integrations");
    revalidatePath("/admin/system");

    return {
      status: "success",
      message: "API-ключ создан. Скопируйте значение сейчас: позже оно будет недоступно.",
      plainToken: created.plainToken,
      tokenName: created.token.name,
      tokenPrefix: created.token.tokenPrefix,
      scopes: created.token.scopes.split(",").filter(Boolean)
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Не удалось создать API-ключ."
    };
  }
}

export async function revokeApiTokenById(formData: FormData) {
  const user = await requireCurrentUserPermission("api_tokens:manage");
  await assertCanPersistSettings(user);
  const tokenId = stringField(formData, "tokenId");
  const revoked = await revokeApiToken({
    workspaceId: user.workspaceId,
    tokenId
  });

  await auditLog({
    workspaceId: user.workspaceId,
    actorId: user.id,
    action: "api_token.revoked",
    targetType: "api_token",
    targetId: revoked.id,
    metadata: {
      name: revoked.name,
      tokenPrefix: revoked.tokenPrefix
    }
  });

  revalidatePath("/admin/tokens");
  revalidatePath("/admin/integrations");
  revalidatePath("/admin/system");
}
