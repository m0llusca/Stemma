import { describe, expect, it } from "vitest";
import { summarizeQueueHealth } from "@/lib/jobs/health";

describe("summarizeQueueHealth", () => {
  const now = new Date("2026-07-01T12:00:00.000Z");

  it("reports ok when nothing failed and no stale queued jobs", () => {
    const result = summarizeQueueHealth({
      queued: 3,
      running: 1,
      failed: 0,
      oldestQueuedAt: new Date(now.getTime() - 60_000),
      now
    });

    expect(result).toEqual({
      status: "ok",
      queued: 3,
      running: 1,
      failed: 0,
      oldestQueuedAgeMs: 60_000
    });
  });

  it("reports degraded when there is at least one failed job", () => {
    const result = summarizeQueueHealth({
      queued: 0,
      running: 0,
      failed: 2,
      oldestQueuedAt: null,
      now
    });

    expect(result.status).toBe("degraded");
    expect(result.failed).toBe(2);
    expect(result.oldestQueuedAgeMs).toBeNull();
  });

  it("reports degraded when the oldest queued job is older than 15 minutes", () => {
    const staleAt = new Date(now.getTime() - (15 * 60_000 + 1));
    const result = summarizeQueueHealth({
      queued: 1,
      running: 0,
      failed: 0,
      oldestQueuedAt: staleAt,
      now
    });

    expect(result.status).toBe("degraded");
    expect(result.oldestQueuedAgeMs).toBe(15 * 60_000 + 1);
  });

  it("stays ok when the oldest queued job is exactly 15 minutes old", () => {
    const result = summarizeQueueHealth({
      queued: 1,
      running: 0,
      failed: 0,
      oldestQueuedAt: new Date(now.getTime() - 15 * 60_000),
      now
    });

    expect(result.status).toBe("ok");
    expect(result.oldestQueuedAgeMs).toBe(15 * 60_000);
  });

  it("returns null age and ok status when there is no oldest queued job", () => {
    const result = summarizeQueueHealth({
      queued: 0,
      running: 0,
      failed: 0,
      oldestQueuedAt: null,
      now
    });

    expect(result.status).toBe("ok");
    expect(result.oldestQueuedAgeMs).toBeNull();
  });
});
