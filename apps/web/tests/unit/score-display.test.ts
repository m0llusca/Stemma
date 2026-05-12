import { describe, expect, it } from "vitest";
import {
  clampQualityScore,
  formatQualityScore,
  formatQualityScoreDelta,
  qualityScoreUnit
} from "@/lib/score-display";

describe("score display helpers", () => {
  it("formats normalized totalScore as points, not percent", () => {
    expect(qualityScoreUnit).toBe("points");
    expect(formatQualityScore(92.4)).toBe("92 балла");
    expect(formatQualityScore(91.5)).toBe("92 балла");
    expect(formatQualityScore(1)).toBe("1 балл");
    expect(formatQualityScore(2)).toBe("2 балла");
    expect(formatQualityScore(5)).toBe("5 баллов");
    expect(formatQualityScore(null)).toBe("Нет оценки");
  });

  it("clamps display values to the stored 0..100 score range", () => {
    expect(clampQualityScore(-5)).toBe(0);
    expect(clampQualityScore(104)).toBe(100);
  });

  it("formats deltas as point changes", () => {
    expect(formatQualityScoreDelta(3.4)).toBe("+3 п.");
    expect(formatQualityScoreDelta(-2.6)).toBe("-3 п.");
    expect(formatQualityScoreDelta(0)).toBe("0 п.");
  });
});
