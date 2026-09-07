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
