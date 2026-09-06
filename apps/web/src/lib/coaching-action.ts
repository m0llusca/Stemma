/**
 * CoachingAction is the follow-up "разбор" attached to a review Finding.
 * Created open on draft/finalize; managers close it so reports KPI
 * (`status: "open"`) stays honest.
 */
export const COACHING_ACTION_STATUSES = ["open", "completed", "cancelled"] as const;

export type CoachingActionStatus = (typeof COACHING_ACTION_STATUSES)[number];

export const coachingActionStatusLabels: Record<CoachingActionStatus, string> = {
  open: "Открыт",
  completed: "Разбор выполнен",
  cancelled: "Отменён"
};

export function isCoachingActionStatus(value: string): value is CoachingActionStatus {
  return (COACHING_ACTION_STATUSES as readonly string[]).includes(value);
}

export function isOpenCoachingActionStatus(status: string) {
  return status === "open";
}
