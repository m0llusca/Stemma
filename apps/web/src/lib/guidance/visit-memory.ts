/**
 * Client-side visit memory for welcome-back + day-1 tour.
 * No backend: localStorage only (cookie optional via same keys if needed later).
 */

export const LAST_VISIT_STORAGE_KEY = "qc:last-visit";
export const DAY1_TOUR_DISMISS_STORAGE_KEY = "qc:day1-tour:dismissed";
export const WELCOME_BACK_ABSENCE_DAYS = 30;

const dayMs = 24 * 60 * 60 * 1000;

export function parseLastVisit(value: string | null | undefined): Date | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return new Date(parsed);
}

export function shouldShowWelcomeBack(
  now: Date,
  lastVisit: Date | null,
  absenceDays = WELCOME_BACK_ABSENCE_DAYS
): boolean {
  if (!lastVisit) {
    return false;
  }

  const thresholdMs = Math.max(1, absenceDays) * dayMs;
  return now.getTime() - lastVisit.getTime() >= thresholdMs;
}

export function isDay1TourDismissed(value: string | null | undefined): boolean {
  return value === "1";
}

/** Safe queue view: no remembered filter trap — full inbox. */
export const SAFE_QUEUE_VIEW_HREF = "/reviews";
