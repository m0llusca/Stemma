import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { enqueueQuotaRiskMessaging } from "@/lib/messaging/quota-risk";
import { resolveReportPeriod, type ReportPeriod } from "@/lib/report-period";
import { formatPeriod } from "@/lib/reports/report-format";
import { reviewWhere } from "@/lib/reports/report-page-data";

const quotaRiskEventMarker = '"eventType":"quota.at_risk"';
const quotaRiskIdempotencyWindowMs = 12 * 60 * 60 * 1000;

type QuotaRow = {
  assigneeName: string;
  supportLine: string | null;
  plannedCount: number;
};

type ReviewForQuota = {
  conversation: {
    assigneeName: string | null;
    supportLine: string | null;
  };
};

/** Narrow client surface so unit tests can inject partial Prisma mocks. */
export type QuotaRiskEvaluationClient = {
  reviewQuota: {
    findMany: (args: Prisma.ReviewQuotaFindManyArgs) => Promise<QuotaRow[]>;
  };
  review: {
    findMany: (args: Prisma.ReviewFindManyArgs) => Promise<ReviewForQuota[]>;
  };
  backendJob: {
    findFirst: (
      args: Prisma.BackendJobFindFirstArgs
    ) => Promise<{ id: string } | null>;
  };
};

export type QuotaRiskEvaluationResult =
  | {
      notified: false;
      reason: "no_plan" | "on_track" | "recent_notification";
      completionPercent?: number;
      actualCount?: number;
      plannedCount?: number;
    }
  | {
      notified: true;
      jobId: string;
      completionPercent: number;
      actualCount: number;
      plannedCount: number;
    };

export function computeWorkspaceQuotaTotals(quotas: QuotaRow[], reviews: ReviewForQuota[]) {
  const plannedCount = quotas.reduce((sum, quota) => sum + quota.plannedCount, 0);
  const actualCount = quotas.reduce((sum, quota) => {
    const matched = reviews.filter(
      (review) =>
        review.conversation.assigneeName === quota.assigneeName &&
        (quota.supportLine ? review.conversation.supportLine === quota.supportLine : true)
    ).length;

    return sum + matched;
  }, 0);

  const completionPercent =
    plannedCount > 0 ? Math.floor((actualCount / plannedCount) * 100) : null;

  return { plannedCount, actualCount, completionPercent };
}

export async function hasRecentQuotaRiskNotification(
  workspaceId: string,
  client: QuotaRiskEvaluationClient,
  now = new Date()
) {
  const cutoff = new Date(now.getTime() - quotaRiskIdempotencyWindowMs);

  const existing = await client.backendJob.findFirst({
    where: {
      workspaceId,
      type: "MESSAGING_DELIVERY",
      status: { in: ["QUEUED", "RUNNING", "SUCCEEDED"] },
      createdAt: { gte: cutoff },
      payloadJson: { contains: quotaRiskEventMarker }
    },
    select: { id: true }
  });

  return existing != null;
}

export async function evaluateWorkspaceQuotaRisk(
  workspaceId: string,
  client?: QuotaRiskEvaluationClient,
  now = new Date()
): Promise<QuotaRiskEvaluationResult> {
  const db = client ?? (prisma as unknown as QuotaRiskEvaluationClient);
  const period = resolveReportPeriod({ period: "vk-current" }, now);

  const [quotas, reviews] = await Promise.all([
    db.reviewQuota.findMany({
      where: {
        workspaceId,
        periodStart: { lte: period.end },
        periodEnd: { gte: period.start }
      },
      select: {
        assigneeName: true,
        supportLine: true,
        plannedCount: true
      },
      orderBy: [{ supportLine: "asc" }, { assigneeName: "asc" }]
    }),
    db.review.findMany({
      where: reviewWhere(workspaceId, period),
      select: {
        conversation: {
          select: {
            assigneeName: true,
            supportLine: true
          }
        }
      }
    })
  ]);

  const { plannedCount, actualCount, completionPercent } = computeWorkspaceQuotaTotals(
    quotas,
    reviews
  );

  if (plannedCount <= 0 || completionPercent == null) {
    return { notified: false, reason: "no_plan" };
  }

  if (completionPercent >= 100) {
    return {
      notified: false,
      reason: "on_track",
      completionPercent,
      actualCount,
      plannedCount
    };
  }

  const payload = {
    workspaceId,
    completionPercent,
    actualCount,
    plannedCount,
    periodLabel: formatPeriodLabel(period),
    href: "/reports?view=details"
  };

  // Default (production) path: claim+enqueue inside one transaction so concurrent
  // RETENTION_CLEANUP workers cannot double-fire quota.at_risk notifications.
  if (!client) {
    const job = await prisma.$transaction(async (tx) => {
      if (await hasRecentQuotaRiskNotification(workspaceId, tx as unknown as QuotaRiskEvaluationClient, now)) {
        return null;
      }

      return enqueueQuotaRiskMessaging(payload, tx);
    });

    if (!job) {
      return {
        notified: false,
        reason: "recent_notification",
        completionPercent,
        actualCount,
        plannedCount
      };
    }

    return {
      notified: true,
      jobId: job.id,
      completionPercent,
      actualCount,
      plannedCount
    };
  }

  if (await hasRecentQuotaRiskNotification(workspaceId, db, now)) {
    return {
      notified: false,
      reason: "recent_notification",
      completionPercent,
      actualCount,
      plannedCount
    };
  }

  const job = await enqueueQuotaRiskMessaging(payload);

  return {
    notified: true,
    jobId: job.id,
    completionPercent,
    actualCount,
    plannedCount
  };
}

function formatPeriodLabel(period: ReportPeriod) {
  return period.label === "Текущий период 22-21" ? period.label : formatPeriod(period);
}
