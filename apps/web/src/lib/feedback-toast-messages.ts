/**
 * Russian confirmation copy for the non-review feedback success paths
 * (self-review acknowledge/dispute and coaching training tasks). Kept in a
 * plain module — not the "use server" action file — so both the server-action
 * state wrappers and the client toast shells can import it.
 */

const FEEDBACK_TOAST_MESSAGES: Record<string, string> = {
  acknowledged: "Оценка принята.",
  appeal_opened: "Апелляция открыта.",
  appeal_confirmed: "Оценка подтверждена.",
  appeal_corrected: "Оценка скорректирована.",
  reanswer_requested: "Запрошен переответ клиенту.",
  reanswer_completed: "Переответ отмечен выполненным."
};

export function feedbackToastMessage(action: string): string {
  return FEEDBACK_TOAST_MESSAGES[action] ?? "Обратная связь обновлена.";
}

export function trainingStatusToastMessage(status: string): string {
  return status === "done" ? "Учебная задача закрыта." : "Учебная задача снова в работе.";
}

export const trainingCreatedToastMessage = "Учебная задача создана.";
