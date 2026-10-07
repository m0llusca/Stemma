export const DUPLICATE_CALIBRATION_REVIEW_MESSAGE =
  "Оценка этой сессии уже есть. Обновите страницу — вторая вкладка сохранила её раньше.";

const CALIBRATION_REVIEW_UNIQUE_FIELDS = ["calibrationSessionId", "conversationId", "reviewerId"] as const;

function uniqueTargetText(error: object) {
  if (!("meta" in error)) {
    return "";
  }

  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  if (Array.isArray(target)) {
    return target.filter((field): field is string => typeof field === "string").join(" ");
  }

  return typeof target === "string" ? target : "";
}

/**
 * True only for the calibration review unique
 * `(calibrationSessionId, conversationId, reviewerId)`.
 * Other P2002 targets, including a missing target, stay ordinary errors.
 */
export function isCalibrationReviewUniqueConflict(error: unknown) {
  if (error === null || typeof error !== "object" || !("code" in error) || (error as { code?: unknown }).code !== "P2002") {
    return false;
  }

  const target = uniqueTargetText(error);
  return CALIBRATION_REVIEW_UNIQUE_FIELDS.every((field) => target.includes(field));
}
