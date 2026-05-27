"use server";

import type { CriterionKind } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditLog } from "@/lib/audit";
import { assertCanPersistSettings, canManageScorecards, getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { validateScorecardDraft, type ScorecardCriterionDraft } from "@/lib/scorecard-validation";

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function parseCriterionDraft(formData: FormData, index: number): ScorecardCriterionDraft {
  return {
    key: stringField(formData, `criterion.${index}.key`),
    label: stringField(formData, `criterion.${index}.label`),
    block: stringField(formData, `criterion.${index}.block`),
    kind: stringField(formData, `criterion.${index}.kind`) as CriterionKind,
    weight: Number(stringField(formData, `criterion.${index}.weight`)),
    required: formData.get(`criterion.${index}.required`) === "on",
    order: index + 1
  };
}

function parseCriterionDraftWithId(formData: FormData, index: number) {
  return {
    id: stringField(formData, `criterion.${index}.id`).trim() || null,
    draft: parseCriterionDraft(formData, index)
  };
}

function parseCriterionCount(formData: FormData) {
  const criterionCount = Number(stringField(formData, "criterionCount"));

  if (!Number.isInteger(criterionCount) || criterionCount < 1 || criterionCount > 20) {
    throw new Error("Количество критериев должно быть от 1 до 20.");
  }

  return criterionCount;
}

export async function createScorecardVersion(formData: FormData) {
  const user = await getCurrentUser();

  if (!canManageScorecards(user.role)) {
    throw new Error("Нет прав на управление формами оценки.");
  }

  await assertCanPersistSettings(user);

  const criterionCount = parseCriterionCount(formData);

  const draft = validateScorecardDraft({
    name: stringField(formData, "name"),
    criteria: Array.from({ length: criterionCount }, (_, index) => parseCriterionDraft(formData, index))
  });

  const latestScorecard = await prisma.scorecard.findFirst({
    where: {
      workspaceId: user.workspaceId
    },
    orderBy: {
      version: "desc"
    },
    select: {
      version: true
    }
  });

  const nextVersion = (latestScorecard?.version ?? 0) + 1;

  await prisma.$transaction(async (tx) => {
    await tx.scorecard.updateMany({
      where: {
        workspaceId: user.workspaceId,
        isActive: true
      },
      data: {
        isActive: false
      }
    });

    const scorecard = await tx.scorecard.create({
      data: {
        workspaceId: user.workspaceId,
        name: draft.name,
        version: nextVersion,
        isActive: true,
        criteria: {
          create: draft.criteria
        }
      }
    });

    await auditLog(
      {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "scorecard.version_created",
        targetType: "scorecard",
        targetId: scorecard.id,
        metadata: {
          version: nextVersion,
          criteria: draft.criteria.map((criterion) => ({
            key: criterion.key,
            block: criterion.block,
            weight: criterion.weight,
            kind: criterion.kind
          }))
        }
      },
      tx
    );
  });

  revalidatePath("/admin/scorecards");
  redirect("/admin/scorecards");
}

export async function updateScorecardVersion(formData: FormData) {
  const user = await getCurrentUser();

  if (!canManageScorecards(user.role)) {
    throw new Error("Нет прав на управление формами оценки.");
  }

  await assertCanPersistSettings(user);

  const scorecardId = stringField(formData, "scorecardId").trim();

  if (!scorecardId) {
    throw new Error("Не выбрана форма оценки для редактирования.");
  }

  const criterionCount = parseCriterionCount(formData);
  const criterionInputs = Array.from({ length: criterionCount }, (_, index) => parseCriterionDraftWithId(formData, index));
  const draft = validateScorecardDraft({
    name: stringField(formData, "name"),
    criteria: criterionInputs.map((input) => input.draft)
  });

  const scorecard = await prisma.scorecard.findFirst({
    where: {
      id: scorecardId,
      workspaceId: user.workspaceId,
      isActive: true
    },
    include: {
      criteria: {
        select: { id: true }
      }
    }
  });

  if (!scorecard) {
    throw new Error("Активная форма оценки не найдена или уже не доступна для редактирования.");
  }

  const existingCriterionIds = new Set(scorecard.criteria.map((criterion) => criterion.id));
  const submittedExistingIds = new Set(
    criterionInputs
      .map((input) => input.id)
      .filter((id): id is string => Boolean(id && existingCriterionIds.has(id)))
  );
  const removedCriterionIds = [...existingCriterionIds].filter((id) => !submittedExistingIds.has(id));

  await prisma.$transaction(async (tx) => {
    const updatedScorecard = await tx.scorecard.update({
      where: { id: scorecard.id },
      data: { name: draft.name },
      select: { id: true, version: true }
    });

    if (removedCriterionIds.length > 0) {
      const deleted = await tx.scorecardCriterion.deleteMany({
        where: {
          id: { in: removedCriterionIds },
          scorecardId: scorecard.id,
          scores: { none: {} }
        }
      });

      if (deleted.count !== removedCriterionIds.length) {
        throw new Error("Нельзя удалить критерий, который уже использовался в проверках. Выпустите новую версию формы.");
      }
    }

    for (let index = 0; index < criterionInputs.length; index += 1) {
      const criterionId = criterionInputs[index].id;

      if (criterionId && existingCriterionIds.has(criterionId)) {
        await tx.scorecardCriterion.update({
          where: { id: criterionId },
          data: {
            key: `__tmp_${criterionId}`,
            order: -(index + 1)
          }
        });
      }
    }

    for (let index = 0; index < draft.criteria.length; index += 1) {
      const criterion = draft.criteria[index];
      const criterionId = criterionInputs[index].id;

      if (criterionId && existingCriterionIds.has(criterionId)) {
        await tx.scorecardCriterion.update({
          where: { id: criterionId },
          data: criterion
        });
      } else {
        await tx.scorecardCriterion.create({
          data: {
            scorecardId: scorecard.id,
            ...criterion
          }
        });
      }
    }

    await auditLog(
      {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "scorecard.version_updated",
        targetType: "scorecard",
        targetId: updatedScorecard.id,
        metadata: {
          version: updatedScorecard.version,
          criteria: draft.criteria.map((criterion) => ({
            key: criterion.key,
            block: criterion.block,
            weight: criterion.weight,
            kind: criterion.kind
          }))
        }
      },
      tx
    );
  });

  revalidatePath("/admin/scorecards");
  redirect("/admin/scorecards?section=overview");
}
