import {
  reportDateInputValue,
  reportPeriodDateLabel,
  type ReportPeriod
} from "@/lib/report-period";
import type { ReportTrendGranularity } from "@/lib/report-trends";
import { formatQualityScore, formatQualityScoreDelta, qualityScoreDelta } from "@/lib/score-display";

export type ReportView = "overview" | "performance" | "process" | "details";

export type TrendTone = "up" | "down" | "flat" | "none";

export const reportViews = [
  { id: "overview", label: "Обзор", description: "Главные метрики и тренд" },
  { id: "performance", label: "Исполнение", description: "Операторы, источники и нормы" },
  { id: "process", label: "Процесс", description: "Переответы, апелляции и риски" },
  { id: "details", label: "Разрезы", description: "Все таблицы для разбора" }
] satisfies Array<{ id: ReportView; label: string; description: string }>;

export function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function resolveReportView(params: Record<string, string | string[] | undefined>): ReportView {
  const view = firstParam(params.view);

  return reportViews.some((item) => item.id === view) ? (view as ReportView) : "overview";
}

export function russianPlural(count: number, forms: [one: string, few: string, many: string]) {
  const lastTwo = count % 100;
  const last = count % 10;

  if (lastTwo >= 11 && lastTwo <= 14) {
    return `${count} ${forms[2]}`;
  }

  if (last === 1) {
    return `${count} ${forms[0]}`;
  }

  if (last >= 2 && last <= 4) {
    return `${count} ${forms[1]}`;
  }

  return `${count} ${forms[2]}`;
}

export function formatAverageScore(value: number | null | undefined) {
  return formatQualityScore(value, "Нет данных");
}

export function formatReviewCount(count: number) {
  return russianPlural(count, ["проверка", "проверки", "проверок"]);
}

export function formatCriterionCount(count: number) {
  return russianPlural(count, ["оценка", "оценки", "оценок"]);
}

export function formatPeriod(period: ReportPeriod) {
  return `${reportPeriodDateLabel(period.start)} - ${reportPeriodDateLabel(period.end)}`;
}

export function reportExportHref(period: ReportPeriod) {
  const params = new URLSearchParams({
    period: period.preset,
    start: reportDateInputValue(period.start),
    end: reportDateInputValue(period.end)
  });

  return `/reports/export?${params.toString()}`;
}

export function reportExportFormatHref(period: ReportPeriod, format: "xlsx" | "pdf") {
  const params = new URLSearchParams({
    period: period.preset,
    start: reportDateInputValue(period.start),
    end: reportDateInputValue(period.end)
  });

  return `/reports/export/${format}?${params.toString()}`;
}

export function reportHref(period: ReportPeriod, extras: Record<string, string> = {}) {
  const params = new URLSearchParams({
    period: period.preset,
    start: reportDateInputValue(period.start),
    end: reportDateInputValue(period.end),
    ...extras
  });

  return `/reports?${params.toString()}`;
}

export function reportViewHref(period: ReportPeriod, view: ReportView, trendGranularity: ReportTrendGranularity) {
  const params = new URLSearchParams({
    period: period.preset,
    start: reportDateInputValue(period.start),
    end: reportDateInputValue(period.end),
    view,
    trend: trendGranularity
  });

  return `/reports?${params.toString()}`;
}

export function reportReviewRangeHref(start: Date, end: Date, extras: Record<string, string> = {}) {
  const params = new URLSearchParams({
    status: "reviewed",
    finalizedFrom: reportDateInputValue(start),
    finalizedTo: reportDateInputValue(end),
    ...extras
  });

  return `/reviews?${params.toString()}`;
}

export function reportReviewHref(period: ReportPeriod, extras: Record<string, string> = {}) {
  return reportReviewRangeHref(period.start, period.end, extras);
}

export function reportDeltaLabel(delta: number | null | undefined) {
  if (delta == null) {
    return "нет базы сравнения";
  }

  if (delta === 0) {
    return "без изменений к прошлому периоду";
  }

  return `${formatQualityScoreDelta(delta)} к среднему баллу прошлого периода`;
}

export function sampleInsight(currentCount: number, previousCount: number) {
  if (currentCount === 0) {
    return "За выбранный период нет завершенных проверок. Сначала откройте очередь и завершите оценки.";
  }

  if (currentCount < 5 || previousCount < 5) {
    return "Выборка мала. Дельта в баллах показывает направление, но не устойчивый тренд.";
  }

  return "Выборка достаточна для сравнения с прошлым периодом.";
}

export function scoreDelta(current: number | null | undefined, previous: number | null | undefined) {
  return qualityScoreDelta(current, previous);
}

export function trendTone(delta: number | null | undefined): TrendTone {
  if (delta == null) {
    return "none";
  }

  if (delta > 0) {
    return "up";
  }

  if (delta < 0) {
    return "down";
  }

  return "flat";
}

export function trendVerdictTitle(delta: number | null, current: number | null) {
  if (current == null) {
    return "Оценка пока не рассчитана";
  }

  if (delta == null) {
    return "Нет базы сравнения";
  }

  if (delta > 0) {
    return "Качество улучшилось";
  }

  if (delta < 0) {
    return "Качество снизилось";
  }

  return "Качество без изменений";
}

export function trendPointDeltaLabel(delta: number | null | undefined) {
  if (delta == null) {
    return "первая точка периода";
  }

  if (delta === 0) {
    return "без изменений к предыдущей точке";
  }

  return `${formatQualityScoreDelta(delta)} к предыдущей точке`;
}

export function targetDistanceLabel(value: number, target: number) {
  const delta = qualityScoreDelta(value, target) ?? 0;

  if (delta >= 0) {
    return "в целевом коридоре";
  }

  return `ниже цели на ${formatQualityScoreDelta(delta).replace("-", "")}`;
}
