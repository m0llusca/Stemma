import { describe, expect, it } from "vitest";
import { computeCoachingImpact } from "@/lib/coaching-impact";

function scores(...values: number[]) {
  return values.map((totalScore) => ({ totalScore }));
}

describe("computeCoachingImpact sample adequacy", () => {
  it("marks the sample adequate only when BOTH windows reach the minimum of 5", () => {
    const result = computeCoachingImpact({
      before: scores(70, 71, 72, 73, 74),
      after: scores(80, 81, 82, 83, 84)
    });

    expect(result.beforeCount).toBe(5);
    expect(result.afterCount).toBe(5);
    expect(result.sampleAdequate).toBe(true);
  });

  it("marks the sample inadequate when the before window is below the minimum", () => {
    const result = computeCoachingImpact({
      before: scores(70, 72),
      after: scores(80, 81, 82, 83, 84)
    });

    expect(result.beforeCount).toBe(2);
    expect(result.afterCount).toBe(5);
    expect(result.sampleAdequate).toBe(false);
  });

  it("marks the sample inadequate when the after window is below the minimum", () => {
    const result = computeCoachingImpact({
      before: scores(70, 71, 72, 73, 74),
      after: scores(80, 84)
    });

    expect(result.beforeCount).toBe(5);
    expect(result.afterCount).toBe(2);
    expect(result.sampleAdequate).toBe(false);
  });

  it("marks the sample inadequate when both windows are below the minimum", () => {
    const result = computeCoachingImpact({
      before: scores(70, 72),
      after: scores(80, 84)
    });

    expect(result.sampleAdequate).toBe(false);
  });

  it("marks the sample inadequate for an insufficient verdict (empty window)", () => {
    const result = computeCoachingImpact({ before: [], after: scores(80, 82) });

    expect(result.trend).toBe("insufficient");
    expect(result.sampleAdequate).toBe(false);
  });
});
