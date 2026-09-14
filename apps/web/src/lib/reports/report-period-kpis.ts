import { prisma } from "@/lib/db";
import type { ReportPeriod } from "@/lib/report-period";

export type ReportPeriodKpis = {
  finalizedCount: number;
  averageScore: number | null;
  criticalCount: number;
  reanswerCount: number;
};

/**
 * Fast SQL aggregate path for interactive report KPI strips.
 * Prefer this over scanning full review rows when only headline metrics are needed.
 */
export async function loadReportPeriodKpis(
  workspaceId: string,
  period: ReportPeriod
): Promise<ReportPeriodKpis> {
  const rows = await prisma.$queryRaw<
    Array<{
      finalized_count: bigint | number;
      average_score: number | null;
      critical_count: bigint | number;
      reanswer_count: bigint | number;
    }>
  >`
    SELECT
      COUNT(*)::bigint AS finalized_count,
      AVG("totalScore")::float AS average_score,
      COUNT(*) FILTER (WHERE "criticalError" = true)::bigint AS critical_count,
      COUNT(*) FILTER (WHERE "needsReanswer" = true)::bigint AS reanswer_count
    FROM "Review"
    WHERE "workspaceId" = ${workspaceId}
      AND status = 'FINALIZED'
      AND "finalizedAt" >= ${period.start}
      AND "finalizedAt" <= ${period.end}
  `;

  const row = rows[0];
  return {
    finalizedCount: Number(row?.finalized_count ?? 0),
    averageScore: row?.average_score ?? null,
    criticalCount: Number(row?.critical_count ?? 0),
    reanswerCount: Number(row?.reanswer_count ?? 0)
  };
}
