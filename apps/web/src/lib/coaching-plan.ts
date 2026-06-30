import { prisma } from "@/lib/db";

/**
 * Coaching-plan loader (Workstream C1). A CoachingPlan groups training
 * assignments for a single agent under a shared development focus. The loader
 * lists a workspace's plans with derived progress (done / total assignments)
 * so the coaching page can render a compact plan board.
 *
 * The before/after score impact metric is intentionally NOT computed here — the
 * coaching page consumes that from src/lib/coaching-impact.ts (Workstream C2).
 */

export const COACHING_PLAN_STATUSES = ["active", "completed"] as const;
export type CoachingPlanStatus = (typeof COACHING_PLAN_STATUSES)[number];

export function isCoachingPlanStatus(value: string): value is CoachingPlanStatus {
  return (COACHING_PLAN_STATUSES as readonly string[]).includes(value);
}

export type CoachingPlanProgress = {
  total: number;
  done: number;
  /** Whole-percent completion (0–100); 0 when the plan has no assignments. */
  percent: number;
};

/**
 * Pure progress math: how many of a plan's assignments are closed. `done`
 * counts assignments whose status is exactly "done"; everything else (open /
 * in_progress / unknown) is treated as outstanding. Defensive against a `done`
 * count larger than `total` (clamped) so the percent never exceeds 100.
 */
export function computePlanProgress(statuses: ReadonlyArray<string>): CoachingPlanProgress {
  const total = statuses.length;
  const done = Math.min(total, statuses.filter((status) => status === "done").length);
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  return { total, done, percent };
}

export type CoachingPlanListItem = {
  id: string;
  agentName: string;
  title: string;
  focusArea: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  progress: CoachingPlanProgress;
};

/**
 * Lists every coaching plan in a workspace with derived assignment progress.
 * Active plans sort ahead of completed ones; within a status the most recently
 * updated plans come first. Each plan carries its linked assignment statuses so
 * the page can render N/total progress without a second query.
 */
export async function listCoachingPlans(workspaceId: string): Promise<CoachingPlanListItem[]> {
  const plans = await prisma.coachingPlan.findMany({
    where: { workspaceId },
    include: {
      assignments: {
        select: { status: true }
      }
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }]
  });

  return plans.map((plan) => ({
    id: plan.id,
    agentName: plan.agentName,
    title: plan.title,
    focusArea: plan.focusArea,
    status: plan.status,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    progress: computePlanProgress(plan.assignments.map((assignment) => assignment.status))
  }));
}
