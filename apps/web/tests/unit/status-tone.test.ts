import { describe, expect, it } from "vitest";
import { statusToneClass, toneForCount, toneForScore } from "@/lib/ui/status-tone";

describe("status tone helpers", () => {
  it("maps score thresholds to semantic tones", () => {
    expect(toneForScore(100)).toBe("positive");
    expect(toneForScore(90)).toBe("positive");
    expect(toneForScore(89.99)).toBe("warning");
    expect(toneForScore(70)).toBe("warning");
    expect(toneForScore(69.99)).toBe("negative");
  });

  it("keeps missing and non-finite scores neutral", () => {
    expect(toneForScore(null)).toBe("neutral");
    expect(toneForScore(undefined)).toBe("neutral");
    expect(toneForScore(Number.NaN)).toBe("neutral");
    expect(toneForScore(Number.POSITIVE_INFINITY)).toBe("neutral");
  });

  it("maps zero and non-zero counts through caller-provided tones", () => {
    expect(toneForCount(0, { zero: "positive", nonZero: "negative" })).toBe("positive");
    expect(toneForCount(3, { zero: "positive", nonZero: "negative" })).toBe("negative");
    expect(toneForCount(-1, { zero: "neutral", nonZero: "warning" })).toBe("warning");
  });

  it("returns the shared semantic class contract", () => {
    expect(statusToneClass("info")).toBe("status-tone status-tone--info");
  });
});
