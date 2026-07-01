const staleQueuedThresholdMs = 15 * 60_000;

export type QueueHealthInput = {
  queued: number;
  running: number;
  failed: number;
  oldestQueuedAt: Date | null;
  now: Date;
};

export type QueueHealthSummary = {
  status: "ok" | "degraded";
  queued: number;
  running: number;
  failed: number;
  oldestQueuedAgeMs: number | null;
};

export function summarizeQueueHealth(input: QueueHealthInput): QueueHealthSummary {
  const oldestQueuedAgeMs = input.oldestQueuedAt === null ? null : input.now.getTime() - input.oldestQueuedAt.getTime();
  const stale = oldestQueuedAgeMs !== null && oldestQueuedAgeMs > staleQueuedThresholdMs;
  const status = input.failed > 0 || stale ? "degraded" : "ok";

  return {
    status,
    queued: input.queued,
    running: input.running,
    failed: input.failed,
    oldestQueuedAgeMs
  };
}
