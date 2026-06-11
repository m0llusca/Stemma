"use server";

import type { FindingOwnerType, Prisma, ReviewSource, RiskLevel, Scorecard, ScorecardCriterion } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditLog } from "@/lib/audit";
import { canFinalizeReview, canSaveReviewDraft, canSelfReview, getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { findLatestReopenedAt, recordReviewEvent } from "@/lib/review-events";
import {
  ReviewLifecycleTransitionError,
  assertReviewCanFinalize,
  assertReviewCanSaveDraft,
  assertSelfReviewScope
} from "@/lib/review-lifecycle";
import {
  assertConditionalWorkflowWrite,
  assertHumanReviewFinalizeTransition,
  assertQaWorkflowTransition
} from "@/lib/review-workflow-policy";
import { calculateReviewScore } from "@/lib/score";

const ownerTypes = ["AGENT", "PROCESS", "PRODUCT", "POLICY", "AI_SYSTEM"] as const;
const riskLevels = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const reviewSources = ["HUMAN", "AI", "CALIBRATION", "SELF_REVIEW"] as const satisfies readonly ReviewSource[];

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
    throw new Error("Некорректный тип ответственности замечания.");
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
    throw new Error("Некорректный тип ответственности замечания.");
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

function reviewSourceField(formData: FormData): ReviewSource {
  const value = optionalString(formData, "reviewSource") ?? "HUMAN";

  if (!reviewSources.includes(value as ReviewSource)) {
    throw new Error("Некорректный тип проверки.");
  }

  return value as ReviewSource;
}

function reviewProcessFields(formData: FormData, summary: string) {
  const criticalError = formData.get("criticalError") === "on";
  const needsReanswer = formData.get("needsReanswer") === "on";

  return {
    feedbackComment: optionalString(formData, "feedbackComment") ?? summary,
    positiveNotes: optionalString(formData, "positiveNotes") ?? "",
    instructionLinks: optionalString(formData, "instructionLinks") ?? "",
    feedbackStatus: "new",
    appealStatus: "none",
    appealDueAt: null,
    criticalError,
    criticalCategory: criticalError ? optionalString(formData, "criticalCategory") ?? "Критическая ошибка" : null,
    needsReanswer,
    reanswerStatus: needsReanswer ? "required" : "not_needed",
    calibrationStatus: "none",
    calibrationNotes: optionalString(formData, "calibrationNotes") ?? ""
  };
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
        assigneeName: true,
        qaStatus: true,
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
    throw new Error("Форма оценки не найдена в текущем рабочем пространстве.");
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

async function findCurrentReview(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  conversationId: string,
  reviewerId: string,
  reviewSource: ReviewSource,
  latestReopenedAt: Date | null
) {
  const where: Prisma.ReviewWhereInput = {
    workspaceId,
    conversationId,
    reviewerId,
    reviewSource
  };

  if (latestReopenedAt) {
    where.OR = [
      { createdAt: { gt: latestReopenedAt } },
      { finalizedAt: { gt: latestReopenedAt } }
    ];
  }

  return tx.review.findFirst({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true
    }
  });
}

async function assertSelfReviewIdentityResolvable(reviewSource: ReviewSource, user: { workspaceId: string; name: string }) {
  if (reviewSource !== "SELF_REVIEW") {
    return;
  }

  const activeUsersWithSameName = await prisma.user.count({
    where: {
      workspaceId: user.workspaceId,
      name: user.name,
      lifecycleStatus: "ACTIVE"
    }
  });

  if (activeUsersWithSameName > 1) {
    throw new ReviewLifecycleTransitionError(
      "В рабочем пространстве несколько активных пользователей с вашим именем, поэтому принадлежность диалога нельзя определить однозначно. Обратитесь к тимлиду."
    );
  }
}

async function assertCurrentReviewStillWritable(
  tx: Prisma.TransactionClient,
  review: { id: string; status: "DRAFT" | "FINALIZED" }
) {
  const result = await tx.review.updateMany({
    where: {
      id: review.id,
      status: review.status
    },
    data: {
      status: review.status
    }
  });

  if (result.count !== 1) {
    throw new ReviewLifecycleTransitionError("Проверка изменилась. Обновите страницу и повторите действие.");
  }
}

export async function saveReviewDraft(formData: FormData) {
  const user = await getCurrentUser();

  const conversationId = requiredString(formData, "conversationId");
  const scorecardId = requiredString(formData, "scorecardId");
  const reviewSource = reviewSourceField(formData);
  const returnTo = optionalString(formData, "returnTo") ?? `/reviews/${conversationId}`;

  if (reviewSource === "SELF_REVIEW" ? !canSelfReview(user.role) : !canSaveReviewDraft(user.role)) {
    throw new Error("Нет прав на сохранение черновиков.");
  }
  const { conversation, scorecard } = await loadReviewContext(user.workspaceId, conversationId, scorecardId);
  assertSelfReviewScope({
    reviewSource,
    userRole: user.role,
    userName: user.name,
    conversationAssigneeName: conversation.assigneeName
  });
  await assertSelfReviewIdentityResolvable(reviewSource, user);
  const { totalScore } = calculateReviewScore(buildScoreInputs(scorecard, formData));
  const validEvidenceMessageIds = new Set(conversation.messages.map((message) => message.id));
  const criterionScores = buildCriterionScores(scorecard, formData, validEvidenceMessageIds);
  const summary = optionalString(formData, "summary") ?? "";
  const processFields = reviewProcessFields(formData, summary);
  const reviewTotalScore = processFields.criticalError ? 0 : totalScore;
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
    const currentConversation = await tx.conversation.findFirst({
      where: {
        id: conversationId,
        workspaceId: user.workspaceId
      },
      select: {
        id: true,
        qaStatus: true,
        qaAssigneeId: true,
        qaAssigneeName: true
      }
    });

    if (!currentConversation) {
      throw new Error("Диалог не найден в текущем рабочем пространстве.");
    }

    if (reviewSource === "HUMAN" && currentConversation.qaStatus === "FINALIZED") {
      throw new ReviewLifecycleTransitionError("Завершенный диалог нужно сначала переоткрыть для нового цикла проверки.");
    }

    const latestReopenedAt = await findLatestReopenedAt(tx, user.workspaceId, conversationId);
    const existingReview = await findCurrentReview(tx, user.workspaceId, conversationId, user.id, reviewSource, latestReopenedAt);
    assertReviewCanSaveDraft(existingReview?.status ?? null);
    if (reviewSource === "HUMAN") {
      assertQaWorkflowTransition({
        fromStatus: currentConversation.qaStatus,
        toStatus: "IN_PROGRESS"
      });
    }
    let reviewId: string;

    if (existingReview) {
      await assertCurrentReviewStillWritable(tx, existingReview);
      await tx.criterionScore.deleteMany({ where: { reviewId: existingReview.id } });
      await tx.finding.deleteMany({ where: { reviewId: existingReview.id } });

      const review = await tx.review.update({
        where: { id: existingReview.id },
        data: {
          scorecardId: scorecard.id,
          reviewSource,
          rubricVersion: scorecard.version,
          totalScore: reviewTotalScore,
          summary,
          ...processFields,
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
          reviewSource,
          rubricVersion: scorecard.version,
          status: "DRAFT",
          totalScore: reviewTotalScore,
          summary,
          ...processFields,
          scores: {
            create: criterionScores
          },
          findings: draftFinding ? { create: draftFinding } : undefined
        },
        select: { id: true }
      });
      reviewId = review.id;
    }

    if (reviewSource === "HUMAN") {
      const updateResult = await tx.conversation.updateMany({
        where: {
          id: conversationId,
          workspaceId: user.workspaceId,
          qaStatus: currentConversation.qaStatus
        },
        data: {
          qaStatus: "IN_PROGRESS",
          qaAssigneeId: currentConversation.qaAssigneeId ?? user.id,
          qaAssigneeName: currentConversation.qaAssigneeName ?? user.name
        }
      });
      assertConditionalWorkflowWrite(updateResult.count);
    }

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
          totalScore: reviewTotalScore
        }
      },
      tx
    );

    await recordReviewEvent(tx, {
      workspaceId: user.workspaceId,
      reviewId,
      conversationId,
      actorId: user.id,
      action: "review.draft_saved",
      fromStatus: existingReview?.status ?? null,
      toStatus: "DRAFT",
      metadata: {
        reviewSource,
        totalScore: reviewTotalScore,
        criticalError: processFields.criticalError
      }
    });
  });

  revalidatePath("/reviews");
  revalidatePath(`/reviews/${conversationId}`);
  redirect(returnTo);
}

export async function finalizeReview(formData: FormData) {
  const user = await getCurrentUser();

  const conversationId = requiredString(formData, "conversationId");
  const scorecardId = requiredString(formData, "scorecardId");
  const reviewSource = reviewSourceField(formData);
  const returnTo = optionalString(formData, "returnTo") ?? `/reviews/${conversationId}`;

  if (reviewSource === "SELF_REVIEW" ? !canSelfReview(user.role) : !canFinalizeReview(user.role)) {
    throw new Error("Нет прав на завершение проверок.");
  }
  const { conversation, scorecard } = await loadReviewContext(user.workspaceId, conversationId, scorecardId);
  assertSelfReviewScope({
    reviewSource,
    userRole: user.role,
    userName: user.name,
    conversationAssigneeName: conversation.assigneeName
  });
  await assertSelfReviewIdentityResolvable(reviewSource, user);
  const { totalScore } = calculateReviewScore(buildScoreInputs(scorecard, formData));
  const coachingAction = optionalString(formData, "coachingAction");
  const coachingAssignee = optionalString(formData, "coachingAssignee");
  const coachingDueAt = optionalString(formData, "coachingDueAt");
  const ownerType = requiredOwnerType(formData);
  const riskLevel = requiredRiskLevel(formData);
  const validEvidenceMessageIds = new Set(conversation.messages.map((message) => message.id));
  const criterionScores = buildCriterionScores(scorecard, formData, validEvidenceMessageIds);
  const summary = requiredString(formData, "summary");
  const processFields = reviewProcessFields(formData, summary);
  const reviewTotalScore = processFields.criticalError ? 0 : totalScore;
  const findingRiskLevel = processFields.criticalError ? "CRITICAL" : riskLevel;

  await prisma.$transaction(async (tx) => {
    const currentConversation = await tx.conversation.findFirst({
      where: {
        id: conversationId,
        workspaceId: user.workspaceId
      },
      select: {
        id: true,
        qaStatus: true,
        qaAssigneeId: true,
        qaAssigneeName: true
      }
    });

    if (!currentConversation) {
      throw new Error("Диалог не найден в текущем рабочем пространстве.");
    }

    const latestReopenedAt = await findLatestReopenedAt(tx, user.workspaceId, conversationId);
    const existingReview = await findCurrentReview(tx, user.workspaceId, conversationId, user.id, reviewSource, latestReopenedAt);
    assertReviewCanFinalize(existingReview?.status ?? null);
    if (reviewSource === "HUMAN") {
      assertHumanReviewFinalizeTransition({ fromStatus: currentConversation.qaStatus });
    }

    if (existingReview) {
      await assertCurrentReviewStillWritable(tx, existingReview);
      await tx.criterionScore.deleteMany({ where: { reviewId: existingReview.id } });
      await tx.finding.deleteMany({ where: { reviewId: existingReview.id } });
    }

    const reviewData = {
      scorecardId: scorecard.id,
      reviewSource,
      rubricVersion: scorecard.version,
      status: "FINALIZED" as const,
      totalScore: reviewTotalScore,
      summary,
      ...processFields,
      finalizedAt: new Date(),
      scores: {
        create: criterionScores
      },
      findings: {
        create: {
          ownerType,
          category: requiredString(formData, "category"),
          rootCause: optionalString(formData, "rootCause") ?? summary,
          riskLevel: findingRiskLevel,
          evidenceSummary: optionalString(formData, "evidenceSummary") ?? summary,
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

    const review = existingReview
      ? await tx.review.update({
          where: { id: existingReview.id },
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

    if (reviewSource === "HUMAN") {
      const updateResult = await tx.conversation.updateMany({
        where: {
          id: conversationId,
          workspaceId: user.workspaceId,
          qaStatus: currentConversation.qaStatus
        },
        data: {
          qaStatus: "FINALIZED",
          qaAssigneeId: currentConversation.qaAssigneeId ?? user.id,
          qaAssigneeName: currentConversation.qaAssigneeName ?? user.name
        }
      });
      assertConditionalWorkflowWrite(updateResult.count);
    }

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
          totalScore: reviewTotalScore,
          criticalError: processFields.criticalError,
          needsReanswer: processFields.needsReanswer
        }
      },
      tx
    );

    await recordReviewEvent(tx, {
      workspaceId: user.workspaceId,
      reviewId: review.id,
      conversationId,
      actorId: user.id,
      action: "review.finalized",
      fromStatus: existingReview?.status ?? null,
      toStatus: "FINALIZED",
      metadata: {
        reviewSource,
        totalScore: reviewTotalScore,
        criticalError: processFields.criticalError,
        needsReanswer: processFields.needsReanswer
      }
    });
  });

  revalidatePath("/reviews");
  revalidatePath(`/reviews/${conversationId}`);
  redirect(returnTo);
}
