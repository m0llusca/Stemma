import { describe, expect, it } from "vitest";
import {
  clampQualityScore,
  formatQualityScore,
  formatQualityScoreDelta,
  qualityScorePointWord,
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
    expect(clampQualityScore(Number.NaN)).toBe(0);
  });

  it("formats Russian point pluralization edge cases", () => {
    expect(formatQualityScore(0)).toBe("0 баллов");
    expect(formatQualityScore(11)).toBe("11 баллов");
    expect(formatQualityScore(14)).toBe("14 баллов");
    expect(formatQualityScore(21)).toBe("21 балл");
    expect(formatQualityScore(22)).toBe("22 балла");
    expect(formatQualityScore(25)).toBe("25 баллов");
    expect(formatQualityScore(100)).toBe("100 баллов");
  });

  it("normalizes exported point-word input before pluralizing", () => {
    expect(qualityScorePointWord(21.4)).toBe("балл");
    expect(qualityScorePointWord(21.5)).toBe("балла");
    expect(qualityScorePointWord(104)).toBe("баллов");
    expect(qualityScorePointWord(-1)).toBe("баллов");
  });

  it("uses empty score labels for non-finite values", () => {
    expect(formatQualityScore(Number.NaN)).toBe("Нет оценки");
    expect(formatQualityScore(Number.POSITIVE_INFINITY, "N/A")).toBe("N/A");
    expect(formatQualityScore(Number.NEGATIVE_INFINITY)).toBe("Нет оценки");
  });

  it("formats deltas as point changes", () => {
    expect(formatQualityScoreDelta(3.4)).toBe("+3 п.");
    expect(formatQualityScoreDelta(-2.6)).toBe("-3 п.");
    expect(formatQualityScoreDelta(0)).toBe("0 п.");
  });

  it("rounds delta half points away from zero", () => {
    expect(formatQualityScoreDelta(-0.5)).toBe("-1 п.");
    expect(formatQualityScoreDelta(-2.5)).toBe("-3 п.");
    expect(formatQualityScoreDelta(0.5)).toBe("+1 п.");
    expect(formatQualityScoreDelta(2.5)).toBe("+3 п.");
  });

  it("formats non-finite deltas as zero point changes", () => {
    expect(formatQualityScoreDelta(Number.NaN)).toBe("0 п.");
    expect(formatQualityScoreDelta(Number.POSITIVE_INFINITY)).toBe("0 п.");
    expect(formatQualityScoreDelta(Number.NEGATIVE_INFINITY)).toBe("0 п.");
  });
});
