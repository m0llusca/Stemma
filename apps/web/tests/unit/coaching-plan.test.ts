import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    coachingPlan: {
      findMany: vi.fn()
    }
  }
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

import {
  COACHING_PLAN_STATUSES,
  computePlanProgress,
  isCoachingPlanStatus,
  listCoachingPlans
} from "@/lib/coaching-plan";

describe("computePlanProgress", () => {
  it("counts only done assignments as completed", () => {
    const progress = computePlanProgress(["done", "open", "in_progress", "done"]);

    expect(progress.total).toBe(4);
    expect(progress.done).toBe(2);
    expect(progress.percent).toBe(50);
  });

  it("returns zero progress for an empty plan without dividing by zero", () => {
    const progress = computePlanProgress([]);

    expect(progress).toEqual({ total: 0, done: 0, percent: 0 });
  });

  it("rounds the completion percent to a whole number", () => {
    const progress = computePlanProgress(["done", "open", "open"]);

    expect(progress.done).toBe(1);
    expect(progress.total).toBe(3);
    expect(progress.percent).toBe(33);
  });

  it("reports 100 percent when every assignment is done", () => {
    const progress = computePlanProgress(["done", "done"]);

    expect(progress.percent).toBe(100);
  });

  it("treats unknown statuses as outstanding", () => {
    const progress = computePlanProgress(["done", "archived"]);

    expect(progress.done).toBe(1);
    expect(progress.percent).toBe(50);
  });
});

describe("isCoachingPlanStatus", () => {
  it("accepts the canonical statuses", () => {
    expect(COACHING_PLAN_STATUSES).toEqual(["active", "completed"]);
    expect(isCoachingPlanStatus("active")).toBe(true);
    expect(isCoachingPlanStatus("completed")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isCoachingPlanStatus("done")).toBe(false);
    expect(isCoachingPlanStatus("")).toBe(false);
  });
});

describe("listCoachingPlans", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("derives progress from each plan's linked assignment statuses", async () => {
    const now = new Date("2026-06-30T00:00:00.000Z");
    mocks.prisma.coachingPlan.findMany.mockResolvedValue([
      {
        id: "plan-1",
        agentName: "Оператор",
        title: "Работа с возражениями",
        focusArea: "Возражения",
        status: "active",
        createdAt: now,
        updatedAt: now,
        assignments: [{ status: "done" }, { status: "open" }, { status: "done" }, { status: "in_progress" }]
      }
    ]);

    const result = await listCoachingPlans("workspace-1");

    expect(mocks.prisma.coachingPlan.findMany).toHaveBeenCalledWith({
      where: { workspaceId: "workspace-1" },
      include: { assignments: { select: { status: true } } },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }]
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "plan-1",
      agentName: "Оператор",
      title: "Работа с возражениями",
      focusArea: "Возражения",
      status: "active",
      progress: { total: 4, done: 2, percent: 50 }
    });
  });

  it("returns an empty list when the workspace has no plans", async () => {
    mocks.prisma.coachingPlan.findMany.mockResolvedValue([]);

    await expect(listCoachingPlans("workspace-1")).resolves.toEqual([]);
  });
});
