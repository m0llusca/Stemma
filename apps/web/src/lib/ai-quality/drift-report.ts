import { computeAiScoreDrift, type AiScoreDrift, type DriftBucketUnit } from "@/lib/ai-quality/drift";
import { prisma } from "@/lib/db";

/**
 * Workspace-level AI score-drift analytics: loads the AI quality score drafts for
 * the workspace (optionally scoped to a time window) and runs them through the
 * pure drift engine, which buckets them and surfaces confidence/fallback
 * regressions. Thin loader — all analysis lives in {@link computeAiScoreDrift}.
 */
export async function loadAiScoreDriftReport(
  workspaceId: string,
  options: { since?: Date; until?: Date; bucket?: DriftBucketUnit } = {}
): Promise<AiScoreDrift | null> {
  const drafts = await prisma.aiQualityDraft.findMany({
    where: {
      workspaceId,
      kind: "score",
      ...(options.since || options.until
        ? {
            createdAt: {
              ...(options.since ? { gte: options.since } : {}),
              ...(options.until ? { lte: options.until } : {})
            }
          }
        : {})
    },
    orderBy: [{ createdAt: "asc" }],
    select: { modelVersion: true, confidence: true, createdAt: true }
  });

  if (drafts.length === 0) {
    return null;
  }

  return computeAiScoreDrift({ drafts, bucket: options.bucket ?? "week" });
}
