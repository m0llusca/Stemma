"use server";

import type { CriterionKind } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/current-user";
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

export async function createScorecardVersion(formData: FormData) {
  const user = await getCurrentUser();
  const criterionCount = Number(stringField(formData, "criterionCount"));

  if (!Number.isInteger(criterionCount) || criterionCount < 1 || criterionCount > 20) {
    throw new Error("Количество критериев должно быть от 1 до 20.");
  }

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
