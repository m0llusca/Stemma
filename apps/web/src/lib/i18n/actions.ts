"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { normalizeLocaleCode } from "@/lib/i18n/locale-codes";

const localizationPath = "/admin/localization";
const manageLocalizationPermission = "appearance:manage";
type TransactionClient = Prisma.TransactionClient;

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function requiredField(formData: FormData, key: string, message: string) {
  const value = stringField(formData, key);

  if (!value) {
    throw new Error(message);
  }

  return value;
}

function rawStringField(formData: FormData, key: string, message: string) {
  const value = formData.get(key);

  if (typeof value !== "string") {
    throw new Error(message);
  }

  return value;
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

async function assertWorkspaceLocale(tx: TransactionClient, workspaceId: string, localeId: string) {
  const locale = await tx.locale.findFirst({
    where: {
      id: localeId,
      workspaceId
    },
    select: {
      id: true
    }
  });

  if (!locale) {
    throw new Error("Язык не найден в текущем рабочем пространстве.");
  }
}

async function assertTranslationKey(tx: TransactionClient, keyId: string) {
  const key = await tx.translationKey.findUnique({
    where: {
      id: keyId
    },
    select: {
      id: true
    }
  });

  if (!key) {
    throw new Error("Ключ перевода не найден.");
  }
}

export async function createLocaleAction(formData: FormData) {
  const user = await requireCurrentUserPermission(manageLocalizationPermission);
  const code = normalizeLocaleCode(requiredField(formData, "code", "Код языка обязателен."));
  const name = requiredField(formData, "name", "Название языка обязательно.");

  try {
    await prisma.locale.create({
      data: {
        workspaceId: user.workspaceId,
        code,
        name,
        isDefault: false,
        isEnabled: true
      }
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new Error("Язык с таким кодом уже существует.");
    }

    throw error;
  }

  revalidatePath(localizationPath);
}

export async function saveTranslationDraftAction(formData: FormData) {
  const user = await requireCurrentUserPermission(manageLocalizationPermission);
  const localeId = requiredField(formData, "localeId", "Не выбран язык перевода.");
  const keyId = requiredField(formData, "keyId", "Не выбран ключ перевода.");
  const draftText = rawStringField(formData, "draftText", "Текст перевода не передан.");

  await prisma.$transaction(async (tx) => {
    await assertWorkspaceLocale(tx, user.workspaceId, localeId);
    await assertTranslationKey(tx, keyId);

    const existingValue = await tx.translationValue.findUnique({
      where: {
        workspaceId_localeId_keyId: {
          workspaceId: user.workspaceId,
          localeId,
          keyId
        }
      },
      select: {
        draftText: true
      }
    });

    await tx.translationValue.upsert({
      where: {
        workspaceId_localeId_keyId: {
          workspaceId: user.workspaceId,
          localeId,
          keyId
        }
      },
      update: {
        draftText
      },
      create: {
        workspaceId: user.workspaceId,
        localeId,
        keyId,
        draftText
      }
    });

    await tx.translationAudit.create({
      data: {
        workspaceId: user.workspaceId,
        localeId,
        keyId,
        actorId: user.id,
        action: "draft_save",
        beforeText: existingValue?.draftText ?? null,
        afterText: draftText
      }
    });
  });

  revalidatePath(localizationPath);
}

async function findWorkspaceTranslationValue(tx: TransactionClient, valueId: string, workspaceId: string) {
  const value = await tx.translationValue.findUnique({
    where: {
      id: valueId
    },
    select: {
      id: true,
      workspaceId: true,
      localeId: true,
      keyId: true,
      draftText: true,
      publishedText: true
    }
  });

  if (!value || value.workspaceId !== workspaceId) {
    throw new Error("Перевод не найден в текущем рабочем пространстве.");
  }

  return value;
}

export async function publishTranslationAction(formData: FormData) {
  const user = await requireCurrentUserPermission(manageLocalizationPermission);
  const valueId = requiredField(formData, "valueId", "Не выбран перевод для публикации.");

  await prisma.$transaction(async (tx) => {
    const value = await findWorkspaceTranslationValue(tx, valueId, user.workspaceId);
    const publishedText = value.draftText;

    if (publishedText == null) {
      throw new Error("Нет черновика перевода для публикации.");
    }

    await tx.translationValue.update({
      where: {
        id: value.id
      },
      data: {
        publishedText,
        publishedAt: new Date(),
        publishedById: user.id,
        version: {
          increment: 1
        }
      }
    });

    await tx.translationAudit.create({
      data: {
        workspaceId: user.workspaceId,
        localeId: value.localeId,
        keyId: value.keyId,
        actorId: user.id,
        action: "publish",
        beforeText: value.publishedText,
        afterText: publishedText
      }
    });
  });

  revalidatePath(localizationPath);
}

export async function rollbackTranslationAction(formData: FormData) {
  const user = await requireCurrentUserPermission(manageLocalizationPermission);
  const valueId = requiredField(formData, "valueId", "Не выбран перевод для отката.");

  await prisma.$transaction(async (tx) => {
    const value = await findWorkspaceTranslationValue(tx, valueId, user.workspaceId);
    const previousPublish = await tx.translationAudit.findFirst({
      where: {
        workspaceId: user.workspaceId,
        localeId: value.localeId,
        keyId: value.keyId,
        action: "publish"
      },
      orderBy: {
        createdAt: "desc"
      },
      select: {
        beforeText: true
      }
    });

    if (!previousPublish) {
      throw new Error("Нет предыдущей опубликованной версии для отката.");
    }

    const restoredText = previousPublish.beforeText;

    await tx.translationValue.update({
      where: {
        id: value.id
      },
      data: {
        draftText: restoredText,
        publishedText: restoredText,
        publishedAt: restoredText === null ? null : new Date(),
        publishedById: restoredText === null ? null : user.id,
        version: {
          increment: 1
        }
      }
    });

    await tx.translationAudit.create({
      data: {
        workspaceId: user.workspaceId,
        localeId: value.localeId,
        keyId: value.keyId,
        actorId: user.id,
        action: "rollback",
        beforeText: value.publishedText,
        afterText: restoredText
      }
    });
  });

  revalidatePath(localizationPath);
}
