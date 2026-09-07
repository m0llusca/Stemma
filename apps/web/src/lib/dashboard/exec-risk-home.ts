export type ExecRiskSignal = {
  overdueReviewCount: number;
  highRiskCount: number;
  queuedCount: number;
};

export type ExecRiskHrefSet = {
  overdue: string;
  highRisk: string;
  queued: string;
};

export type ExecRiskNarrative = {
  title: string;
  description: string;
  primaryHref: string;
  actionLabel: string;
  tone: "success" | "warning" | "danger";
};

/**
 * 30-second exec story: SLA first, then high-risk findings, then unstarted queue.
 * Every narrative points at a filtered queue — never a vanity chart.
 */
export function buildExecRiskNarrative(
  signal: ExecRiskSignal,
  hrefs: ExecRiskHrefSet
): ExecRiskNarrative {
  if (signal.overdueReviewCount > 0) {
    return {
      title: `Просрочено SLA: ${signal.overdueReviewCount}`,
      description: "Открыть очередь проверок с нарушенным сроком.",
      primaryHref: hrefs.overdue,
      actionLabel: "Разобрать",
      tone: "danger"
    };
  }

  if (signal.highRiskCount > 0) {
    return {
      title: `Высокий риск: ${signal.highRiskCount}`,
      description: "Открыть проверки с критичными замечаниями за 30 дней.",
      primaryHref: hrefs.highRisk,
      actionLabel: "Разобрать",
      tone: "danger"
    };
  }

  if (signal.queuedCount > 0) {
    return {
      title: `Очередь без старта: ${signal.queuedCount}`,
      description: "Открыть проверки, которые ещё не взяли в работу.",
      primaryHref: hrefs.queued,
      actionLabel: "Открыть очередь",
      tone: "warning"
    };
  }

  return {
    title: "Критичных отклонений нет",
    description: "SLA и высокий риск под контролем. Очередь можно открыть при необходимости.",
    primaryHref: hrefs.queued,
    actionLabel: "Открыть очередь",
    tone: "success"
  };
}
