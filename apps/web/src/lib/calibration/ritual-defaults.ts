/**
 * Default cadence for the weekly calibration ritual.
 * Shared by the create form and agreement banding so trust signals stay consistent.
 */

/** Points from the reference review still count as aligned. */
export const CALIBRATION_ALIGNMENT_BAND = 10;

/** Suggested sample size for a weekly ritual (conversations × graders). */
export const CALIBRATION_RITUAL_MIN_CONVERSATIONS = 3;
export const CALIBRATION_RITUAL_MIN_PARTICIPANTS = 2;

export const CALIBRATION_RITUAL_DEFAULT_NAME = "Калибровка недели";

/** Default due date = today + N calendar days (UTC date input). */
export const CALIBRATION_RITUAL_DUE_IN_DAYS = 7;

export function defaultCalibrationDueDate(now = new Date()): string {
  const due = new Date(now);
  due.setUTCDate(due.getUTCDate() + CALIBRATION_RITUAL_DUE_IN_DAYS);
  return due.toISOString().slice(0, 10);
}

export function calibrationRitualHints(input: {
  conversationCount: number;
  participantCount: number;
}) {
  const needsMoreConversations = input.conversationCount < CALIBRATION_RITUAL_MIN_CONVERSATIONS;
  const needsMoreParticipants = input.participantCount < CALIBRATION_RITUAL_MIN_PARTICIPANTS;

  return {
    needsMoreConversations,
    needsMoreParticipants,
    ready:
      !needsMoreConversations &&
      !needsMoreParticipants &&
      input.conversationCount > 0 &&
      input.participantCount > 0,
    copy: needsMoreConversations
      ? `Для ритуала недели выберите ≥${CALIBRATION_RITUAL_MIN_CONVERSATIONS} обращений.`
      : needsMoreParticipants
        ? `Нужны ≥${CALIBRATION_RITUAL_MIN_PARTICIPANTS} проверяющих, чтобы считать согласие.`
        : `Эталон ±${CALIBRATION_ALIGNMENT_BAND} баллов — разбор расхождений после оценок.`
  };
}
