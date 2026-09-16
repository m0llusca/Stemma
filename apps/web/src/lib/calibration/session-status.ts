export type CalibrationStatusTone = "success" | "info" | "neutral" | "warning";

/**
 * Session chip must not say «Завершена» while scores are still outstanding.
 * Waiting counts belong to the selected / listed session, not the workspace card.
 */
export function calibrationSessionStatusLabel(status: string, waitingCount = 0): string {
  if (waitingCount > 0 && (status === "completed" || status === "archived")) {
    return status === "archived" ? "Архив · ждут оценки" : "Закрыта · ждут оценки";
  }

  switch (status) {
    case "draft":
      return "Черновик";
    case "active":
      return "Активна";
    case "completed":
      return "Завершена";
    case "archived":
      return "В архиве";
    default:
      return status;
  }
}

export function calibrationSessionStatusTone(status: string, waitingCount = 0): CalibrationStatusTone {
  if (waitingCount > 0 && (status === "completed" || status === "archived")) {
    return "warning";
  }

  if (status === "completed") {
    return "success";
  }

  if (status === "active") {
    return "info";
  }

  return "neutral";
}

export function calibrationItemClosedBadge(status: string, waitingCount = 0): string {
  if (status === "archived") {
    return waitingCount > 0 ? "Архив · ждут оценки" : "Архив";
  }

  return waitingCount > 0 ? "Закрыта · ждут оценки" : "Завершена";
}
