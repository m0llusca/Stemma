import { prisma } from "@/lib/db";
import { logBackendEvent } from "@/lib/observability";

/** Soft SLO: oldest queued job should not sit longer than this without alert. */
export const QUEUE_OLDEST_AGE_ALERT_MS = 15 * 60 * 1000;

export async function loadQueueHealthSnapshot(workspaceId: string) {
  const oldestQueued = await prisma.backendJob.findFirst({
    where: { workspaceId, status: "QUEUED" },
    orderBy: [{ createdAt: "asc" }],
    select: { id: true, type: true, queueName: true, createdAt: true, runAfter: true }
  });

  const now = Date.now();
  const oldestAgeMs = oldestQueued
    ? Math.max(0, now - (oldestQueued.runAfter?.getTime() ?? oldestQueued.createdAt.getTime()))
    : 0;

  return {
    oldestQueued,
    oldestAgeMs,
    alert: Boolean(oldestQueued && oldestAgeMs >= QUEUE_OLDEST_AGE_ALERT_MS)
  };
}

/** Emit a structured warning when the oldest queued job breaches the soft SLO. */
export async function reportQueueAgeIfNeeded(workspaceId: string, requestId?: string) {
  const health = await loadQueueHealthSnapshot(workspaceId);
  if (!health.alert || !health.oldestQueued) {
    return health;
  }

  logBackendEvent({
    level: "warn",
    requestId,
    event: "backend_jobs.oldest_queued_age_alert",
    workspaceId,
    metadata: {
      jobId: health.oldestQueued.id,
      type: health.oldestQueued.type,
      queueName: health.oldestQueued.queueName,
      oldestAgeMs: health.oldestAgeMs,
      thresholdMs: QUEUE_OLDEST_AGE_ALERT_MS
    }
  });

  return health;
}
