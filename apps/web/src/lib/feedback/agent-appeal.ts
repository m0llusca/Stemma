/**
 * Agent-facing appeal phases. Backend statuses stay unchanged
 * (`none` / `open` / `calibration` / `confirmed` / `corrected`);
 * this module only maps them to the locked RU loop:
 * не подана → подана → на рассмотрении → решена.
 */

export const AGENT_APPEAL_PHASES = ["none", "submitted", "in_review", "resolved"] as const;

export type AgentAppealPhase = (typeof AGENT_APPEAL_PHASES)[number];

export const agentAppealPhaseLabels: Record<AgentAppealPhase, string> = {
  none: "Не подана",
  submitted: "Подана",
  in_review: "На рассмотрении",
  resolved: "Решена"
};

export type AgentAppealAvailabilityInput = {
  appealStatus: string;
  feedbackStatus: string;
};

export function toAgentAppealPhase(appealStatus: string): AgentAppealPhase {
  switch (appealStatus) {
    case "none":
      return "none";
    case "open":
      return "submitted";
    case "calibration":
      return "in_review";
    case "confirmed":
    case "corrected":
      return "resolved";
    default:
      return "none";
  }
}

export function isFeedbackClosed(feedbackStatus: string): boolean {
  return feedbackStatus === "acknowledged" || feedbackStatus === "corrected";
}

export function canAgentOpenAppeal(input: AgentAppealAvailabilityInput): boolean {
  return input.appealStatus === "none" && !isFeedbackClosed(input.feedbackStatus);
}

export function agentAppealDisabledReason(input: AgentAppealAvailabilityInput): string | null {
  if (canAgentOpenAppeal(input)) {
    return null;
  }

  if (input.appealStatus === "open") {
    return "Апелляция уже подана и ожидает решения руководителя.";
  }

  if (input.appealStatus === "calibration") {
    return "Апелляция на рассмотрении — на калибровке.";
  }

  if (input.appealStatus === "confirmed" || input.appealStatus === "corrected") {
    return "Апелляция уже закрыта.";
  }

  if (isFeedbackClosed(input.feedbackStatus)) {
    return "Оценка уже принята — апелляцию открыть нельзя.";
  }

  return "Апелляция по этой проверке недоступна.";
}

export function agentAppealNextSteps(input: {
  phase: AgentAppealPhase;
  dueAt?: Date | null;
}): string {
  if (input.phase === "submitted") {
    const due = input.dueAt
      ? ` до ${input.dueAt.toLocaleDateString("ru-RU")}`
      : " в течение 2 дней";
    return `Руководитель рассмотрит апелляцию${due}. Статус сотрудника не меняется.`;
  }

  if (input.phase === "in_review") {
    return "Апелляция на рассмотрении у руководителя или на калибровке. Статус сотрудника не меняется.";
  }

  if (input.phase === "resolved") {
    return "Решение по апелляции зафиксировано.";
  }

  return "Если пункт спорный — откройте апелляцию с обоснованием. Это рабочий разбор, не санкция.";
}
