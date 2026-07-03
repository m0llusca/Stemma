"use server";

import type { RiskLevel } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit";
import { assertCanPersistSettings, canManageSamplingRules, canManageTraining, getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import type { FeedbackActionState } from "@/lib/feedback-actions";
import { knowledgeEntryCreatedToastMessage } from "@/lib/feedback-toast-messages";

const riskLevels = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const satisfies readonly RiskLevel[];

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function numberField(formData: FormData, key: string, fallback: number) {
  const parsed = Number(stringField(formData, key));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function createKnowledgeEntry(formData: FormData) {
  const user = await getCurrentUser();

  if (!canManageTraining(user.role)) {
    throw new Error("Нет прав на базу ошибок.");
  }

  await assertCanPersistSettings(user);

  const riskLevel = stringField(formData, "riskLevel") || "MEDIUM";
  const selectedCategory = stringField(formData, "category");
  const newCategory = stringField(formData, "newCategory");
  const category = selectedCategory === "__new__" ? newCategory : selectedCategory || newCategory;

  if (!riskLevels.includes(riskLevel as RiskLevel)) {
    throw new Error("Некорректный уровень риска.");
  }

  if (!category) {
    throw new Error("Укажите категорию типовой ошибки.");
  }

  await prisma.qualityKnowledgeEntry.create({
    data: {
      workspaceId: user.workspaceId,
      category,
      title: stringField(formData, "title"),
      description: stringField(formData, "description"),
      recommendation: stringField(formData, "recommendation"),
      riskLevel: riskLevel as RiskLevel,
      source: stringField(formData, "source") || "manual"
    }
  });

  revalidatePath("/coaching");
}

/**
 * `useActionState` wrapper around `createKnowledgeEntry` mirroring the
 * feedback/coaching pattern: reuse the exact validation/permission logic and
 * add a success/error state so the `ToastActionForm` shell can raise a toast
 * instead of silently revalidating.
 */
export async function createKnowledgeEntryState(
  _state: FeedbackActionState,
  formData: FormData
): Promise<FeedbackActionState> {
  try {
    await createKnowledgeEntry(formData);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Не удалось сохранить правило."
    };
  }

  return { ok: true, toast: knowledgeEntryCreatedToastMessage, nonce: Date.now() };
}

/**
 * Общий парсер полей формы правила выборки: create и update принимают одну и
 * ту же форму (`SamplingRuleForm`), поэтому набор полей, дефолты и сериализация
 * условий обязаны совпадать.
 */
function parseSamplingRuleFields(formData: FormData) {
  const conditions = {
    channel: stringField(formData, "channel") || undefined,
    csatBucket: stringField(formData, "csatBucket") || undefined,
    supportLine: stringField(formData, "supportLine") || undefined,
    tag: stringField(formData, "tag") || undefined
  };

  return {
    name: stringField(formData, "name"),
    type: stringField(formData, "type") || "manual",
    conditionsJson: JSON.stringify(conditions),
    targetPercent: numberField(formData, "targetPercent", 10),
    priority: numberField(formData, "priority", 100),
    isActive: formData.get("isActive") === "on"
  };
}

export async function createSamplingRule(formData: FormData) {
  const user = await getCurrentUser();

  if (!canManageSamplingRules(user.role)) {
    throw new Error("Нет прав на правила выборки.");
  }

  await assertCanPersistSettings(user);

  await prisma.samplingRule.create({
    data: {
      workspaceId: user.workspaceId,
      ...parseSamplingRuleFields(formData)
    }
  });

  revalidatePath("/admin/sampling");
}

export async function updateSamplingRule(formData: FormData) {
  const user = await getCurrentUser();

  if (!canManageSamplingRules(user.role)) {
    throw new Error("Нет прав на правила выборки.");
  }

  await assertCanPersistSettings(user);

  const id = stringField(formData, "ruleId");

  if (!id) {
    throw new Error("Не указано правило для обновления.");
  }

  const data = parseSamplingRuleFields(formData);

  // where { id, workspaceId }: updateMany не даст изменить правило чужого
  // workspace даже при подделанном ruleId — просто не найдёт запись.
  const result = await prisma.samplingRule.updateMany({
    where: { id, workspaceId: user.workspaceId },
    data
  });

  if (result.count === 0) {
    throw new Error("Правило не найдено.");
  }

  await auditLog({
    workspaceId: user.workspaceId,
    actorId: user.id,
    action: "sampling_rule.updated",
    targetType: "sampling_rule",
    targetId: id,
    metadata: {
      name: data.name,
      type: data.type,
      conditionsJson: data.conditionsJson,
      targetPercent: data.targetPercent,
      priority: data.priority,
      isActive: data.isActive
    }
  });

  revalidatePath("/admin/sampling");
}

export async function updateSamplingRuleStatus(formData: FormData) {
  const user = await getCurrentUser();

  if (!canManageSamplingRules(user.role)) {
    throw new Error("Нет прав на правила выборки.");
  }

  await assertCanPersistSettings(user);

  const id = stringField(formData, "id");
  const isActive = formData.get("isActive") === "on";

  await prisma.samplingRule.updateMany({
    where: { id, workspaceId: user.workspaceId },
    data: { isActive }
  });

  revalidatePath("/admin/sampling");
}
