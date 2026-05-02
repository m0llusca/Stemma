"use server";

import type { FindingOwnerType, Prisma, RiskLevel, Scorecard, ScorecardCriterion } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditLog } from "@/lib/audit";
import { canFinalizeReview, canSaveReviewDraft, getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { calculateReviewScore } from "@/lib/score";

const ownerTypes = ["AGENT", "PROCESS", "PRODUCT", "POLICY", "AI_SYSTEM"] as const;
const riskLevels = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

type ReviewScorecard = Scorecard & { criteria: ScorecardCriterion[] };

function requiredString(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Не заполнено обязательное поле: ${key}`);
  }

  return value.trim();
}

function optionalString(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function requiredOwnerType(formData: FormData): FindingOwnerType {
  const value = requiredString(formData, "ownerType");

  if (!ownerTypes.includes(value as FindingOwnerType)) {
    throw new Error("Некорректный тип ответственности находки.");
  }

  return value as FindingOwnerType;
}

function requiredRiskLevel(formData: FormData): RiskLevel {
  const value = requiredString(formData, "riskLevel");

  if (!riskLevels.includes(value as RiskLevel)) {
    throw new Error("Некорректный уровень риска.");
  }

  return value as RiskLevel;
}

function optionalOwnerType(formData: FormData): FindingOwnerType | undefined {
  const value = optionalString(formData, "ownerType");

  if (value === undefined) {
    return undefined;
  }

  if (!ownerTypes.includes(value as FindingOwnerType)) {
    throw new Error("Некорректный тип ответственности находки.");
  }

  return value as FindingOwnerType;
}

function optionalRiskLevel(formData: FormData): RiskLevel | undefined {
  const value = optionalString(formData, "riskLevel");

  if (value === undefined) {
    return undefined;
  }

  if (!riskLevels.includes(value as RiskLevel)) {
    throw new Error("Некорректный уровень риска.");
  }

  return value as RiskLevel;
}

async function loadReviewContext(workspaceId: string, conversationId: string, scorecardId: string) {
  const [conversation, scorecard] = await Promise.all([
    prisma.conversation.findFirst({
      where: {
        id: conversationId,
        workspaceId
      },
      select: {
        id: true,
        qaAssigneeId: true,
        qaAssigneeName: true,
        messages: {
          select: { id: true }
        }
      }
    }),
    prisma.scorecard.findFirst({
      where: {
        id: scorecardId,
        workspaceId
      },
      include: {
        criteria: {
          orderBy: { order: "asc" }
        }
      }
    })
  ]);

  if (!conversation) {
    throw new Error("Диалог не найден в текущем рабочем пространстве.");
  }

  if (!scorecard) {
    throw new Error("Скоркарта не найдена в текущем рабочем пространстве.");
  }

  return { conversation, scorecard };
}

function buildScoreInputs(scorecard: ReviewScorecard, formData: FormData) {
  return scorecard.criteria.map((criterion) => {
    const isNotApplicable = formData.get(`criterion.${criterion.id}.notApplicable`) === "on";
    const scoreValue = optionalString(formData, `criterion.${criterion.id}.score`);
    const passedValue = optionalString(formData, `criterion.${criterion.id}.passed`);

    return {
      id: criterion.id,
      label: criterion.label,
      type: criterion.kind,
      weight: criterion.weight,
      score: isNotApplicable || scoreValue === undefined ? undefined : Number(scoreValue),
      passed: isNotApplicable || passedValue === undefined ? undefined : passedValue === "true",
      notApplicable: isNotApplicable
    };
  });
}

function buildCriterionScores(scorecard: ReviewScorecard, formData: FormData, validEvidenceMessageIds: Set<string>) {
  return scorecard.criteria.map((criterion) => {
    const isNotApplicable = formData.get(`criterion.${criterion.id}.notApplicable`) === "on";
    const scoreValue = optionalString(formData, `criterion.${criterion.id}.score`);
    const passedValue = optionalString(formData, `criterion.${criterion.id}.passed`);
    const evidenceMessageId = optionalString(formData, `criterion.${criterion.id}.evidenceMessageId`);

    if (evidenceMessageId && !validEvidenceMessageIds.has(evidenceMessageId)) {
      throw new Error(`Некорректное сообщение-доказательство для критерия ${criterion.id}.`);
    }

    return {
      criterionId: criterion.id,
      value: criterion.kind === "SCALE_1_3" && !isNotApplicable ? Number(scoreValue) : null,
      passed: criterion.kind === "PASS_FAIL" && !isNotApplicable ? passedValue === "true" : null,
      isNotApplicable,
      comment: optionalString(formData, `criterion.${criterion.id}.comment`) ?? "",
      evidenceMessageId
    };
  });
}

async function findCurrentDraft(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  conversationId: string,
  reviewerId: string
) {
  return tx.review.findFirst({
    where: {
      workspaceId,
      conversationId,
      reviewerId,
      status: "DRAFT"
    },
    select: {
      id: true
    }
  });
}

export async function saveReviewDraft(formData: FormData) {
  const user = await getCurrentUser();

  if (!canSaveReviewDraft(user.role)) {
    throw new Error("Нет прав на сохранение черновиков.");
  }

  const conversationId = requiredString(formData, "conversationId");
  const scorecardId = requiredString(formData, "scorecardId");
  const { conversation, scorecard } = await loadReviewContext(user.workspaceId, conversationId, scorecardId);
  const { totalScore } = calculateReviewScore(buildScoreInputs(scorecard, formData));
  const validEvidenceMessageIds = new Set(conversation.messages.map((message) => message.id));
  const criterionScores = buildCriterionScores(scorecard, formData, validEvidenceMessageIds);
  const summary = optionalString(formData, "summary") ?? "";
  const draftCategory = optionalString(formData, "category");
  const draftRootCause = optionalString(formData, "rootCause");
  const draftEvidenceSummary = optionalString(formData, "evidenceSummary");
  const draftOwnerType = optionalOwnerType(formData);
  const draftRiskLevel = optionalRiskLevel(formData);
  const coachingAction = optionalString(formData, "coachingAction");
  const coachingAssignee = optionalString(formData, "coachingAssignee");
  const coachingDueAt = optionalString(formData, "coachingDueAt");
  const draftFinding =
    draftCategory && draftRootCause && draftEvidenceSummary
      ? {
          ownerType: draftOwnerType ?? "AGENT",
          category: draftCategory,
          rootCause: draftRootCause,
          riskLevel: draftRiskLevel ?? "LOW",
          evidenceSummary: draftEvidenceSummary,
          coachingAction:
            coachingAction && coachingAssignee
              ? {
                  create: {
                    assignee: coachingAssignee,
                    action: coachingAction,
                    dueAt: coachingDueAt ? new Date(`${coachingDueAt}T00:00:00.000Z`) : undefined
                  }
                }
              : undefined
        }
      : undefined;

  await prisma.$transaction(async (tx) => {
    const existingDraft = await findCurrentDraft(tx, user.workspaceId, conversationId, user.id);
    let reviewId: string;

    if (existingDraft) {
      await tx.criterionScore.deleteMany({ where: { reviewId: existingDraft.id } });
      await tx.finding.deleteMany({ where: { reviewId: existingDraft.id } });

      const review = await tx.review.update({
        where: { id: existingDraft.id },
        data: {
          scorecardId: scorecard.id,
          reviewSource: "HUMAN",
          rubricVersion: scorecard.version,
          totalScore,
          summary,
          scores: {
            create: criterionScores
          },
          findings: draftFinding ? { create: draftFinding } : undefined
        },
        select: { id: true }
      });
      reviewId = review.id;
    } else {
      const review = await tx.review.create({
        data: {
          workspaceId: user.workspaceId,
          conversationId,
          reviewerId: user.id,
          scorecardId: scorecard.id,
          reviewSource: "HUMAN",
          rubricVersion: scorecard.version,
          status: "DRAFT",
          totalScore,
          summary,
          scores: {
            create: criterionScores
          },
          findings: draftFinding ? { create: draftFinding } : undefined
        },
        select: { id: true }
      });
      reviewId = review.id;
    }

    await tx.conversation.update({
      where: { id: conversationId },
      data: {
        qaStatus: "IN_PROGRESS",
        qaAssigneeId: conversation.qaAssigneeId ?? user.id,
        qaAssigneeName: conversation.qaAssigneeName ?? user.name
      }
    });

    await auditLog(
      {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "review.draft_saved",
        targetType: "review",
        targetId: reviewId,
        metadata: {
          conversationId,
          scorecardId: scorecard.id,
          totalScore
        }
      },
      tx
    );
  });

  revalidatePath("/reviews");
  revalidatePath(`/reviews/${conversationId}`);
  redirect(`/reviews/${conversationId}`);
}

export async function finalizeReview(formData: FormData) {
  const user = await getCurrentUser();

  if (!canFinalizeReview(user.role)) {
    throw new Error("Нет прав на завершение проверок.");
  }

  const conversationId = requiredString(formData, "conversationId");
  const scorecardId = requiredString(formData, "scorecardId");
  const { conversation, scorecard } = await loadReviewContext(user.workspaceId, conversationId, scorecardId);
  const { totalScore } = calculateReviewScore(buildScoreInputs(scorecard, formData));
  const coachingAction = optionalString(formData, "coachingAction");
  const coachingAssignee = optionalString(formData, "coachingAssignee");
  const coachingDueAt = optionalString(formData, "coachingDueAt");
  const ownerType = requiredOwnerType(formData);
  const riskLevel = requiredRiskLevel(formData);
  const validEvidenceMessageIds = new Set(conversation.messages.map((message) => message.id));
  const criterionScores = buildCriterionScores(scorecard, formData, validEvidenceMessageIds);

  await prisma.$transaction(async (tx) => {
    const existingDraft = await findCurrentDraft(tx, user.workspaceId, conversationId, user.id);

    if (existingDraft) {
      await tx.criterionScore.deleteMany({ where: { reviewId: existingDraft.id } });
      await tx.finding.deleteMany({ where: { reviewId: existingDraft.id } });
    }

    const reviewData = {
      scorecardId: scorecard.id,
      reviewSource: "HUMAN" as const,
      rubricVersion: scorecard.version,
      status: "FINALIZED" as const,
      totalScore,
      summary: requiredString(formData, "summary"),
      finalizedAt: new Date(),
      scores: {
        create: criterionScores
      },
      findings: {
        create: {
          ownerType,
          category: requiredString(formData, "category"),
          rootCause: requiredString(formData, "rootCause"),
          riskLevel,
          evidenceSummary: requiredString(formData, "evidenceSummary"),
          coachingAction:
            coachingAction && coachingAssignee
              ? {
                  create: {
                    assignee: coachingAssignee,
                    action: coachingAction,
                    dueAt: coachingDueAt ? new Date(`${coachingDueAt}T00:00:00.000Z`) : undefined
                  }
                }
              : undefined
        }
      }
    };

    const review = existingDraft
      ? await tx.review.update({
          where: { id: existingDraft.id },
          data: reviewData
        })
      : await tx.review.create({
          data: {
            workspaceId: user.workspaceId,
            conversationId,
            reviewerId: user.id,
            ...reviewData
          }
        });

    await tx.conversation.update({
      where: { id: conversationId },
      data: {
        qaStatus: "FINALIZED",
        qaAssigneeId: conversation.qaAssigneeId ?? user.id,
        qaAssigneeName: conversation.qaAssigneeName ?? user.name
      }
    });

    await auditLog(
      {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "review.finalized",
        targetType: "review",
        targetId: review.id,
        metadata: {
          conversationId,
          scorecardId: scorecard.id,
          totalScore
        }
      },
      tx
    );
  });

  revalidatePath("/reviews");
  revalidatePath(`/reviews/${conversationId}`);
  redirect(`/reviews/${conversationId}`);
}
