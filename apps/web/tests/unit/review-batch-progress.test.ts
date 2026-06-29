import { describe, expect, it } from "vitest";
import {
  computeBatchProgress,
  formatBatchProgress,
  nextQueuedConversationId
} from "@/lib/review/batch-progress";

describe("computeBatchProgress", () => {
  it("returns the 1-based position and total for a conversation in the queue", () => {
    const queue = ["a", "b", "c", "d"];

    expect(computeBatchProgress("a", queue)).toEqual({ position: 1, total: 4, isLast: false, remaining: 3 });
    expect(computeBatchProgress("c", queue)).toEqual({ position: 3, total: 4, isLast: false, remaining: 1 });
  });

  it("flags the final conversation as last with no remaining cases", () => {
    const queue = ["a", "b", "c"];

    expect(computeBatchProgress("c", queue)).toEqual({ position: 3, total: 3, isLast: true, remaining: 0 });
  });

  it("collapses an unknown id to position 0 without inventing a number", () => {
    const queue = ["a", "b"];

    expect(computeBatchProgress("missing", queue)).toEqual({ position: 0, total: 2, isLast: false, remaining: 0 });
  });

  it("handles an empty queue", () => {
    expect(computeBatchProgress("a", [])).toEqual({ position: 0, total: 0, isLast: false, remaining: 0 });
  });
});

describe("nextQueuedConversationId", () => {
  it("returns the id that follows the current conversation", () => {
    expect(nextQueuedConversationId("b", ["a", "b", "c"])).toBe("c");
  });

  it("returns null when the current conversation is last", () => {
    expect(nextQueuedConversationId("c", ["a", "b", "c"])).toBeNull();
  });

  it("falls back to the first queued id when the current id is unknown", () => {
    expect(nextQueuedConversationId("missing", ["a", "b"])).toBe("a");
  });

  it("returns null for an empty queue", () => {
    expect(nextQueuedConversationId("a", [])).toBeNull();
  });
});

describe("formatBatchProgress", () => {
  it("formats the Russian N из M label", () => {
    expect(formatBatchProgress({ position: 2, total: 5, isLast: false, remaining: 3 })).toBe("2 из 5");
  });

  it("renders a neutral fallback when out of queue", () => {
    expect(formatBatchProgress({ position: 0, total: 5, isLast: false, remaining: 0 })).toBe("Вне очереди");
    expect(formatBatchProgress({ position: 0, total: 0, isLast: false, remaining: 0 })).toBe("Вне очереди");
  });
});
