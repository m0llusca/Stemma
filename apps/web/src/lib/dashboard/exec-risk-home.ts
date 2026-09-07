import type { RoleName } from "@prisma/client";
import { queueFilterResetHref } from "@/lib/auth/role-home";
import { opsQueueKpiMetricHref } from "@/lib/dashboard/queue-kpi-href";

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

export const EXEC_RISK_CHART_KEYS = ["overdue", "highRisk", "queued"] as const;
export type ExecRiskChartKey = (typeof EXEC_RISK_CHART_KEYS)[number];

export type ExecRiskChartBar = {
  key: ExecRiskChartKey;
  label: string;
  value: number;
  href: string;
  tone: "danger" | "warning" | "neutral";
};

export type ExecRiskChartModel =
  | { empty: true; resetHref: string }
  | { empty: false; bars: readonly ExecRiskChartBar[]; resetHref: string };

const execRiskChartLabels = {
  overdue: "Просрочено SLA",
  highRisk: "Высокий риск",
  queued: "Очередь без старта"
} as const;

export type ExecRiskNarrative = {
  title: string;
  description: string;
  primaryHref: string;
  actionLabel: string;
  tone: "accent" | "warning" | "danger";
};

/**
 * 30-second exec story: SLA first, then high-risk findings, then unstarted queue.
 * Live signals drill into a filtered queue. All-zero uses the same role-home
 * reset as the chart EmptyState — never a QUEUED dump of an empty slice.
 */
export function buildExecRiskNarrative(
  signal: ExecRiskSignal,
  hrefs: ExecRiskHrefSet,
  options: { role?: RoleName; name?: string } = {}
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
    title: "Нет сигналов за период",
    description: "В текущих срезах нет просроченного SLA и высокого риска — это не сертификат «всё в порядке». Откройте очередь, чтобы проверить объём.",
    primaryHref: queueFilterResetHref(options.role ?? "EXEC", { name: options.name }),
    actionLabel: "Открыть очередь",
    tone: "accent"
  };
}

export type ExecRiskChartHrefInput = {
  signal: ExecRiskSignal;
  hrefs: ExecRiskHrefSet;
  role: RoleName;
  name?: string;
};

function kpiInput(input: ExecRiskChartHrefInput) {
  return {
    overdueReviewCount: input.signal.overdueReviewCount,
    queuedCount: input.signal.queuedCount,
    role: input.role,
    name: input.name
  };
}

/**
 * Chart / tile drill for one exec risk bar.
 * Overdue and queued reuse `opsQueueKpiMetricHref` (same contract as ops KPI).
 * High risk uses the existing 30-day findings href when the count is live;
 * a zero bar falls back to the role-home queue reset — never the unreviewed impostor.
 */
export function execRiskChartBarHref(
  key: ExecRiskChartKey,
  input: ExecRiskChartHrefInput
): string {
  switch (key) {
    case "overdue":
      return opsQueueKpiMetricHref("overdue", kpiInput(input));
    case "queued":
      return opsQueueKpiMetricHref("queued", kpiInput(input));
    case "highRisk":
      return input.signal.highRiskCount > 0
        ? input.hrefs.highRisk
        : queueFilterResetHref(input.role, { name: input.name });
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}

function execRiskChartValue(key: ExecRiskChartKey, signal: ExecRiskSignal): number {
  switch (key) {
    case "overdue":
      return signal.overdueReviewCount;
    case "highRisk":
      return signal.highRiskCount;
    case "queued":
      return signal.queuedCount;
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}

export function buildExecRiskChartModel(input: ExecRiskChartHrefInput): ExecRiskChartModel {
  const resetHref = queueFilterResetHref(input.role, { name: input.name });
  const { signal } = input;

  if (
    signal.overdueReviewCount === 0 &&
    signal.highRiskCount === 0 &&
    signal.queuedCount === 0
  ) {
    return { empty: true, resetHref };
  }

  return {
    empty: false,
    resetHref,
    bars: EXEC_RISK_CHART_KEYS.map((key) => {
      const value = execRiskChartValue(key, signal);

      return {
        key,
        label: execRiskChartLabels[key],
        value,
        href: execRiskChartBarHref(key, input),
        tone: value === 0 ? "neutral" : key === "queued" ? "warning" : "danger"
      };
    })
  };
}
