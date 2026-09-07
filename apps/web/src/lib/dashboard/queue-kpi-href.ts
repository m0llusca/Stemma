import type { RoleName } from "@prisma/client";
import { queueFilterResetHref } from "@/lib/auth/role-home";

/**
 * Take-next / role-home filter vocabulary for KPI → queue drills.
 * A generic "open work" list filter is an impostor dump — never a primary KPI href.
 */
export const OVERDUE_SLA_HREF = "/reviews?due=overdue";
export const QUEUED_STATUS_HREF = "/reviews?qaStatus=QUEUED";

export type OpsQueueKpiHrefInput = {
  overdueReviewCount: number;
  queuedCount: number;
  role: RoleName;
  name?: string;
};

export type OpsQueueKpiMetric = "overdue" | "queued";

/**
 * Honest drill for the ops «просрочено / очередь» KPI.
 * Overdue → due filter. Unstarted work → qaStatus=QUEUED (same as exec / pulse).
 * Zero → role-home reset (analyst inbox) or unfiltered `/reviews`.
 */
export function opsQueueKpiHref(input: OpsQueueKpiHrefInput): string {
  if (input.overdueReviewCount > 0) {
    return OVERDUE_SLA_HREF;
  }

  if (input.queuedCount > 0) {
    return QUEUED_STATUS_HREF;
  }

  return queueFilterResetHref(input.role, { name: input.name });
}

/**
 * Per-bar / per-tile drill for the same overdue / queued filters.
 * A zero bar does not invent a dump — it uses the role-home reset, same as
 * `opsQueueKpiHref` when both counts are empty.
 */
export function opsQueueKpiMetricHref(
  metric: OpsQueueKpiMetric,
  input: OpsQueueKpiHrefInput
): string {
  if (metric === "overdue") {
    return input.overdueReviewCount > 0
      ? OVERDUE_SLA_HREF
      : queueFilterResetHref(input.role, { name: input.name });
  }

  return input.queuedCount > 0
    ? QUEUED_STATUS_HREF
    : queueFilterResetHref(input.role, { name: input.name });
}
