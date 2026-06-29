/**
 * Pure batch-progress math for the review workbench footer.
 *
 * The reviewer grades conversations one by one from a priority-ordered queue.
 * The footer shows an "N из M" counter so flow-state grading has a sense of
 * place: how far along the current batch is and how many cases remain.
 *
 * `position` is the 1-based index of the current conversation inside the
 * (already priority-sorted) list of conversation ids; `total` is the length of
 * that list. Both are clamped so a stale/foreign id never produces a nonsense
 * counter — an unknown id collapses to `0 / total`, which the UI renders as a
 * neutral "вне очереди" hint rather than a misleading number.
 */

export type BatchProgress = {
  /** 1-based position of the current conversation, or 0 when not in the queue. */
  position: number;
  /** Total number of conversations in the current batch. */
  total: number;
  /** True when the current conversation is the last one in the batch. */
  isLast: boolean;
  /** Number of conversations queued after the current one. */
  remaining: number;
};

export function computeBatchProgress(currentId: string, queueIds: readonly string[]): BatchProgress {
  const total = queueIds.length;
  const index = queueIds.indexOf(currentId);

  if (index < 0) {
    return { position: 0, total, isLast: false, remaining: 0 };
  }

  const position = index + 1;

  return {
    position,
    total,
    isLast: position === total,
    remaining: Math.max(total - position, 0)
  };
}

/**
 * The id of the next conversation to grade after the current one. Returns
 * `null` when the current conversation is the last (or unknown), so the caller
 * can fall back to the empty-queue path.
 */
export function nextQueuedConversationId(currentId: string, queueIds: readonly string[]): string | null {
  const index = queueIds.indexOf(currentId);

  if (index < 0) {
    return queueIds[0] ?? null;
  }

  return queueIds[index + 1] ?? null;
}

/** Human-facing "N из M" label, or a neutral fallback when out of queue. */
export function formatBatchProgress(progress: BatchProgress): string {
  if (progress.position === 0 || progress.total === 0) {
    return "Вне очереди";
  }

  return `${progress.position} из ${progress.total}`;
}
