import { describe, expect, it, vi } from "vitest";
import {
  computeCoachingImpact,
  loadAssignmentCoachingImpact,
  trainingEffectKpiHint
} from "@/lib/coaching-impact";

function scores(...values: number[]) {
  return values.map((totalScore) => ({ totalScore }));
}

describe("computeCoachingImpact", () => {
  it("reports an upward trend when the after-average climbs by at least 1 point", () => {
    const result = computeCoachingImpact({
      before: scores(70, 72),
      after: scores(80, 84)
    });

    expect(result.beforeAvg).toBe(71);
    expect(result.afterAvg).toBe(82);
    expect(result.delta).toBe(11);
    expect(result.beforeCount).toBe(2);
    expect(result.afterCount).toBe(2);
    expect(result.trend).toBe("up");
  });

  it("reports a downward trend when the after-average drops by at least 1 point", () => {
    const result = computeCoachingImpact({
      before: scores(90, 88),
      after: scores(80, 78)
    });

    expect(result.beforeAvg).toBe(89);
    expect(result.afterAvg).toBe(79);
    expect(result.delta).toBe(-10);
    expect(result.trend).toBe("down");
  });

  it("treats a sub-1-point move in either direction as flat", () => {
    const up = computeCoachingImpact({ before: scores(80), after: scores(80.6) });
    expect(up.delta).toBe(0.6);
    expect(up.trend).toBe("flat");

    const down = computeCoachingImpact({ before: scores(80), after: scores(79.4) });
    expect(down.delta).toBe(-0.6);
    expect(down.trend).toBe("flat");

    const equal = computeCoachingImpact({ before: scores(80), after: scores(80) });
    expect(equal.delta).toBe(0);
    expect(equal.trend).toBe("flat");
  });

  it("rounds both averages and the delta to one decimal place", () => {
    const result = computeCoachingImpact({
      before: scores(70, 71, 73),
      after: scores(80, 81, 81)
    });

    // before mean = 71.333..., after mean = 80.666...
    expect(result.beforeAvg).toBe(71.3);
    expect(result.afterAvg).toBe(80.7);
    expect(result.delta).toBe(9.4);
    expect(result.trend).toBe("up");
  });

  it("returns insufficient when the before window is empty", () => {
    const result = computeCoachingImpact({ before: [], after: scores(80, 82) });

    expect(result.beforeAvg).toBeNull();
    expect(result.afterAvg).toBe(81);
    expect(result.delta).toBeNull();
    expect(result.beforeCount).toBe(0);
    expect(result.afterCount).toBe(2);
    expect(result.trend).toBe("insufficient");
  });

  it("returns insufficient when the after window is empty", () => {
    const result = computeCoachingImpact({ before: scores(80, 82), after: [] });

    expect(result.beforeAvg).toBe(81);
    expect(result.afterAvg).toBeNull();
    expect(result.delta).toBeNull();
    expect(result.beforeCount).toBe(2);
    expect(result.afterCount).toBe(0);
    expect(result.trend).toBe("insufficient");
  });

  it("returns insufficient when both windows are empty", () => {
    const result = computeCoachingImpact({ before: [], after: [] });

    expect(result.beforeAvg).toBeNull();
    expect(result.afterAvg).toBeNull();
    expect(result.delta).toBeNull();
    expect(result.trend).toBe("insufficient");
  });
});

describe("trainingEffectKpiHint", () => {
  it("does not frame a negative average effect as growth", () => {
    expect(trainingEffectKpiHint({ averageDelta: -4, positiveCount: 2, measuredCount: 3 })).toBe(
      "Снижение в среднем; рост у 2 из 3"
    );
  });
});

describe("loadAssignmentCoachingImpact", () => {
  const pivot = new Date("2026-06-15T00:00:00.000Z");

  function buildClient(before: Array<{ totalScore: number }>, after: Array<{ totalScore: number }>) {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce(before.map((row) => ({ totalScore: row.totalScore, finalizedAt: pivot })))
      .mockResolvedValueOnce(after.map((row) => ({ totalScore: row.totalScore, finalizedAt: pivot })));
    return {
      review: { findMany }
    };
  }

  it("queries finalized human reviews for the assignee in the before and after windows", async () => {
    const client = buildClient(scores(70, 72), scores(80, 84));

    const result = await loadAssignmentCoachingImpact(
      { workspaceId: "workspace-1", assigneeName: "Иван Петров", pivot },
      client as never
    );

    expect(client.review.findMany).toHaveBeenCalledTimes(2);

    const beforeBefore = new Date(pivot.getTime() - 14 * 24 * 60 * 60 * 1000);
    const afterEnd = new Date(pivot.getTime() + 14 * 24 * 60 * 60 * 1000);

    // before window: [pivot - 14d, pivot)
    expect(client.review.findMany).toHaveBeenNthCalledWith(1, {
      where: {
        workspaceId: "workspace-1",
        status: "FINALIZED",
        reviewSource: "HUMAN",
        conversation: { assigneeName: "Иван Петров" },
        finalizedAt: { gte: beforeBefore, lt: pivot }
      },
      select: { totalScore: true, finalizedAt: true }
    });

    // after window: [pivot, pivot + 14d]
    expect(client.review.findMany).toHaveBeenNthCalledWith(2, {
      where: {
        workspaceId: "workspace-1",
        status: "FINALIZED",
        reviewSource: "HUMAN",
        conversation: { assigneeName: "Иван Петров" },
        finalizedAt: { gte: pivot, lte: afterEnd }
      },
      select: { totalScore: true, finalizedAt: true }
    });

    expect(result.beforeAvg).toBe(71);
    expect(result.afterAvg).toBe(82);
    expect(result.delta).toBe(11);
    expect(result.trend).toBe("up");
  });

  it("honours a custom windowDays when building both windows", async () => {
    const client = buildClient(scores(80), scores(80));

    await loadAssignmentCoachingImpact(
      { workspaceId: "workspace-1", assigneeName: "Иван Петров", pivot, windowDays: 7 },
      client as never
    );

    const beforeBefore = new Date(pivot.getTime() - 7 * 24 * 60 * 60 * 1000);
    const afterEnd = new Date(pivot.getTime() + 7 * 24 * 60 * 60 * 1000);

    expect(client.review.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ finalizedAt: { gte: beforeBefore, lt: pivot } })
      })
    );
    expect(client.review.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ finalizedAt: { gte: pivot, lte: afterEnd } })
      })
    );
  });

  it("maps empty windows to an insufficient verdict", async () => {
    const client = buildClient([], []);

    const result = await loadAssignmentCoachingImpact(
      { workspaceId: "workspace-1", assigneeName: "Иван Петров", pivot },
      client as never
    );

    expect(result.beforeCount).toBe(0);
    expect(result.afterCount).toBe(0);
    expect(result.trend).toBe("insufficient");
  });
});
