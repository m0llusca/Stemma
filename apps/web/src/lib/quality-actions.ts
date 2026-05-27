"use server";

import type { RiskLevel } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { assertCanPersistSettings, canManageSamplingRules, canManageTraining, getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

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

export async function createSamplingRule(formData: FormData) {
  const user = await getCurrentUser();

  if (!canManageSamplingRules(user.role)) {
    throw new Error("Нет прав на правила выборки.");
  }

  await assertCanPersistSettings(user);

  const conditions = {
    channel: stringField(formData, "channel") || undefined,
    csatBucket: stringField(formData, "csatBucket") || undefined,
    supportLine: stringField(formData, "supportLine") || undefined,
    tag: stringField(formData, "tag") || undefined
  };

  await prisma.samplingRule.create({
    data: {
      workspaceId: user.workspaceId,
      name: stringField(formData, "name"),
      type: stringField(formData, "type") || "manual",
      conditionsJson: JSON.stringify(conditions),
      targetPercent: numberField(formData, "targetPercent", 10),
      priority: numberField(formData, "priority", 100),
      isActive: formData.get("isActive") === "on"
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
