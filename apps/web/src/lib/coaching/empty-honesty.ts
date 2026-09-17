import type { RoleName } from "@prisma/client";
import { hasPermission } from "@/lib/auth/permissions";

/**
 * Coaching KPI hints at zero must stay observational. A count of 0 is not
 * proof that deadlines or quality are under control.
 */

/** Operator home: SUPPORT_AGENT, or consume-only (no training:manage). */
export function isCoachingOperatorHome(role: RoleName): boolean {
  if (role === "SUPPORT_AGENT") {
    return true;
  }

  return hasPermission(role, "training:consume") && !hasPermission(role, "training:manage");
}

export const COACHING_PLANS_AGENT_EMPTY_DESCRIPTION =
  "Здесь появятся планы развития, которые назначит руководитель.";

export const COACHING_PLANS_LEAD_EMPTY_DESCRIPTION =
  "Сгруппируйте разборы оператора под одной темой развития и отслеживайте прогресс.";

export function coachingPlansEmptyDescription(role: RoleName): string {
  return isCoachingOperatorHome(role)
    ? COACHING_PLANS_AGENT_EMPTY_DESCRIPTION
    : COACHING_PLANS_LEAD_EMPTY_DESCRIPTION;
}

/** One-line operator empties — no EmptyState icon / block padding. */
export const COACHING_SLICE_AGENT_EMPTY = "В этом срезе нет задач.";

export const COACHING_RULES_AGENT_EMPTY = "Типовые правила появятся здесь, когда их добавит тимлид.";

export const COACHING_OPERATOR_EMPTY_LINE_CLASS = "py-1 text-sm text-muted-foreground";

export function coachingInWorkKpiHint(weekDueCount: number): string {
  if (weekDueCount > 0) {
    return `${weekDueCount} со сроком на неделе`;
  }

  return "Сроков на этой неделе нет";
}

export function coachingOverdueKpiHint(overdueCount: number): string {
  if (overdueCount > 0) {
    return "Поднимаются в начало очереди";
  }

  return "Просроченных в текущем срезе нет";
}
