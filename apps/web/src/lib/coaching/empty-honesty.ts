/**
 * Coaching KPI hints at zero must stay observational. A count of 0 is not
 * proof that deadlines or quality are under control.
 */

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
