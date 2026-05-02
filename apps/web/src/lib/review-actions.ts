"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FindingOwnerType, RiskLevel } from "@prisma/client";
import { auditLog } from "@/lib/audit";
import { canFinalizeReview, getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { calculateReviewScore } from "@/lib/score";

const ownerTypes = ["AGENT", "PROCESS", "PRODUCT", "POLICY", "AI_SYSTEM"] as const;
const riskLevels = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

function requiredString(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing required field: ${key}`);
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
    throw new Error("Invalid finding owner type.");
  }

  return value as FindingOwnerType;
}

function requiredRiskLevel(formData: FormData): RiskLevel {
  const value = requiredString(formData, "riskLevel");

  if (!riskLevels.includes(value as RiskLevel)) {
    throw new Error("Invalid risk level.");
  }

  return value as RiskLevel;
}

export async function finalizeReview(formData: FormData) {
  const user = await getCurrentUser();

  if (!canFinalizeReview(user.role)) {
    throw new Error("You do not have permission to finalize reviews.");
  }

  const conversationId = requiredString(formData, "conversationId");
  const scorecardId = requiredString(formData, "scorecardId");

  const [conversation, scorecard] = await Promise.all([
    prisma.conversation.findFirst({
      where: {
        id: conversationId,
        workspaceId: user.workspaceId
      },
      select: {
        id: true,
        messages: {
          select: { id: true }
        }
      }
    }),
    prisma.scorecard.findFirst({
      where: {
        id: scorecardId,
        workspaceId: user.workspaceId
      },
      include: {
        criteria: {
          orderBy: { order: "asc" }
        }
      }
    })
  ]);

  if (!conversation) {
    throw new Error("Conversation was not found in this workspace.");
  }

  if (!scorecard) {
    throw new Error("Scorecard was not found in this workspace.");
  }

  const scoreInputs = scorecard.criteria.map((criterion) => {
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

  const { totalScore } = calculateReviewScore(scoreInputs);
  const coachingAction = optionalString(formData, "coachingAction");
  const coachingAssignee = optionalString(formData, "coachingAssignee");
  const coachingDueAt = optionalString(formData, "coachingDueAt");
  const ownerType = requiredOwnerType(formData);
  const riskLevel = requiredRiskLevel(formData);
  const validEvidenceMessageIds = new Set(conversation.messages.map((message) => message.id));
  const criterionScores = scorecard.criteria.map((criterion) => {
    const isNotApplicable = formData.get(`criterion.${criterion.id}.notApplicable`) === "on";
    const scoreValue = optionalString(formData, `criterion.${criterion.id}.score`);
    const passedValue = optionalString(formData, `criterion.${criterion.id}.passed`);
    const evidenceMessageId = optionalString(formData, `criterion.${criterion.id}.evidenceMessageId`);

    if (evidenceMessageId && !validEvidenceMessageIds.has(evidenceMessageId)) {
      throw new Error(`Invalid evidence message for criterion ${criterion.id}.`);
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

  await prisma.$transaction(async (tx) => {
    const review = await tx.review.create({
      data: {
        workspaceId: user.workspaceId,
        conversationId,
        reviewerId: user.id,
        scorecardId: scorecard.id,
        reviewSource: "HUMAN",
        rubricVersion: scorecard.version,
        status: "FINALIZED",
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
