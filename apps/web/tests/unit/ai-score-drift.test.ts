import { describe, expect, it } from "vitest";
import { computeAiScoreDrift } from "@/lib/ai-quality/drift";

describe("computeAiScoreDrift", () => {
  it("returns empty buckets and regressions for empty input", () => {
    expect(computeAiScoreDrift({ drafts: [], bucket: "day" })).toEqual({
      buckets: [],
      regressions: []
    });
  });

  it("groups drafts into UTC calendar-day buckets, ascending, only non-empty", () => {
    const result = computeAiScoreDrift({
      bucket: "day",
      drafts: [
        // 2026-01-03 (two drafts)
        { modelVersion: "gpt-4o", confidence: 0.8, createdAt: new Date("2026-01-03T23:59:59Z") },
        { modelVersion: "gpt-4o", confidence: 0.6, createdAt: new Date("2026-01-03T00:00:00Z") },
        // 2026-01-01 (one draft, earlier — must sort ascending)
        { modelVersion: "gpt-4o", confidence: 0.9, createdAt: new Date("2026-01-01T12:00:00Z") }
      ]
    });

    expect(result.buckets.map((b) => b.periodStart)).toEqual(["2026-01-01", "2026-01-03"]);
    expect(result.buckets[0]).toMatchObject({ periodStart: "2026-01-01", count: 1, meanConfidence: 0.9, fallbackRate: 0 });
    expect(result.buckets[1].count).toBe(2);
    expect(result.buckets[1].meanConfidence).toBeCloseTo(0.7, 10);
  });

  it("groups drafts into ISO-week buckets starting Monday UTC", () => {
    const result = computeAiScoreDrift({
      bucket: "week",
      drafts: [
        // 2026-01-01 is a Thursday -> ISO week Monday is 2025-12-29
        { modelVersion: "gpt-4o", confidence: 0.5, createdAt: new Date("2026-01-01T10:00:00Z") },
        // 2026-01-04 is Sunday -> same ISO week (Monday 2025-12-29)
        { modelVersion: "gpt-4o", confidence: 0.7, createdAt: new Date("2026-01-04T10:00:00Z") },
        // 2026-01-05 is Monday -> next ISO week (Monday 2026-01-05)
        { modelVersion: "gpt-4o", confidence: 0.9, createdAt: new Date("2026-01-05T00:00:00Z") }
      ]
    });

    expect(result.buckets.map((b) => b.periodStart)).toEqual(["2025-12-29", "2026-01-05"]);
    expect(result.buckets[0].count).toBe(2);
    expect(result.buckets[1].count).toBe(1);
  });

  it("groups drafts into calendar-month buckets UTC", () => {
    const result = computeAiScoreDrift({
      bucket: "month",
      drafts: [
        { modelVersion: "gpt-4o", confidence: 0.5, createdAt: new Date("2026-02-15T10:00:00Z") },
        { modelVersion: "gpt-4o", confidence: 0.7, createdAt: new Date("2026-02-28T23:59:59Z") },
        { modelVersion: "gpt-4o", confidence: 0.9, createdAt: new Date("2026-01-31T23:59:59Z") }
      ]
    });

    expect(result.buckets.map((b) => b.periodStart)).toEqual(["2026-01-01", "2026-02-01"]);
    expect(result.buckets[0].count).toBe(1);
    expect(result.buckets[1].count).toBe(2);
  });

  it("averages only non-null confidences and yields null when a bucket has none", () => {
    const result = computeAiScoreDrift({
      bucket: "day",
      drafts: [
        { modelVersion: "gpt-4o", confidence: 0.4, createdAt: new Date("2026-01-01T01:00:00Z") },
        { modelVersion: "gpt-4o", confidence: null, createdAt: new Date("2026-01-01T02:00:00Z") },
        { modelVersion: "gpt-4o", confidence: 0.8, createdAt: new Date("2026-01-01T03:00:00Z") },
        // separate day with only null confidences -> meanConfidence null
        { modelVersion: "gpt-4o", confidence: null, createdAt: new Date("2026-01-02T01:00:00Z") }
      ]
    });

    expect(result.buckets[0].meanConfidence).toBeCloseTo(0.6, 10);
    expect(result.buckets[1].meanConfidence).toBeNull();
  });

  it("computes fallbackRate from deterministic model versions", () => {
    const result = computeAiScoreDrift({
      bucket: "day",
      drafts: [
        { modelVersion: "deterministic-1", confidence: 0.5, createdAt: new Date("2026-01-01T01:00:00Z") },
        { modelVersion: "gpt-4o", confidence: 0.5, createdAt: new Date("2026-01-01T02:00:00Z") },
        { modelVersion: "deterministic-1", confidence: 0.5, createdAt: new Date("2026-01-01T03:00:00Z") },
        { modelVersion: "gpt-4o", confidence: 0.5, createdAt: new Date("2026-01-01T04:00:00Z") }
      ]
    });

    expect(result.buckets[0].fallbackRate).toBeCloseTo(0.5, 10);
  });

  it("flags a confidence_drop regression when mean confidence falls by >= 0.15", () => {
    const result = computeAiScoreDrift({
      bucket: "day",
      drafts: [
        { modelVersion: "gpt-4o", confidence: 0.9, createdAt: new Date("2026-01-01T01:00:00Z") },
        { modelVersion: "gpt-4o", confidence: 0.7, createdAt: new Date("2026-01-02T01:00:00Z") }
      ]
    });

    const drop = result.regressions.find((r) => r.kind === "confidence_drop");
    expect(drop).toBeDefined();
    expect(drop?.periodStart).toBe("2026-01-02");
    expect(typeof drop?.detail).toBe("string");
    expect(drop?.detail.length).toBeGreaterThan(0);
  });

  it("does not flag a confidence_drop below the 0.15 threshold", () => {
    const result = computeAiScoreDrift({
      bucket: "day",
      drafts: [
        { modelVersion: "gpt-4o", confidence: 0.9, createdAt: new Date("2026-01-01T01:00:00Z") },
        { modelVersion: "gpt-4o", confidence: 0.8, createdAt: new Date("2026-01-02T01:00:00Z") }
      ]
    });

    expect(result.regressions.some((r) => r.kind === "confidence_drop")).toBe(false);
  });

  it("flags a fallback_spike regression when fallbackRate rises by >= 0.25", () => {
    const result = computeAiScoreDrift({
      bucket: "day",
      drafts: [
        // day 1: 0% fallback
        { modelVersion: "gpt-4o", confidence: 0.8, createdAt: new Date("2026-01-01T01:00:00Z") },
        // day 2: 100% fallback -> +1.0 spike
        { modelVersion: "deterministic-1", confidence: 0.8, createdAt: new Date("2026-01-02T01:00:00Z") }
      ]
    });

    const spike = result.regressions.find((r) => r.kind === "fallback_spike");
    expect(spike).toBeDefined();
    expect(spike?.periodStart).toBe("2026-01-02");
    expect(typeof spike?.detail).toBe("string");
    expect(spike?.detail.length).toBeGreaterThan(0);
  });

  it("compares against the immediately preceding NON-empty bucket only", () => {
    const result = computeAiScoreDrift({
      bucket: "day",
      drafts: [
        { modelVersion: "gpt-4o", confidence: 0.9, createdAt: new Date("2026-01-01T01:00:00Z") },
        // gap on 2026-01-02 (no drafts); 2026-01-03 compares back to 2026-01-01
        { modelVersion: "gpt-4o", confidence: 0.5, createdAt: new Date("2026-01-03T01:00:00Z") }
      ]
    });

    const drop = result.regressions.find((r) => r.kind === "confidence_drop");
    expect(drop?.periodStart).toBe("2026-01-03");
  });
});
