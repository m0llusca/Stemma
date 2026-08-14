import type { ReportView } from "@/lib/reports/report-format";

export type ReportCompare = "previous" | "year" | "none";
export type ReportGrain = "day" | "week";
export type ReportRisk = "low" | "medium" | "high" | "critical" | "high_plus";
export type ReportSection =
  | "trend"
  | "drivers"
  | "matrix"
  | "ai-drift"
  | "quota"
  | "risk";
export type ReportChartView = "graph" | "table";
export type ReportSeries = "score" | "volume" | "previous" | "target";
export type ReportEvidenceType = "trend" | "driver" | "matrix" | "kpi";

export type ReportFilterOption = {
  slug: string;
  value: string;
};

export type ReportFilterCatalog = {
  teams: readonly ReportFilterOption[];
  blocks: readonly ReportFilterOption[];
  sources: readonly string[];
};

export type ReportAnalysisState = {
  view: ReportView;
  period: string;
  start?: string;
  end?: string;
  compare: ReportCompare;
  grain: ReportGrain;
  team?: string;
  source?: string;
  risk?: ReportRisk;
  block?: string;
  section?: ReportSection;
  chartView: ReportChartView;
  series: ReportSeries[];
  evidenceType?: ReportEvidenceType;
  evidenceKey?: string;
};

export type ReportAnalysisPatch = {
  [Key in keyof ReportAnalysisState]?: ReportAnalysisState[Key] | null;
};

type SearchInput = Record<string, string | string[] | undefined>;

const views = ["overview", "performance", "process", "details"] as const;
const periodPresets = [
  "vk-current",
  "vk-previous",
  "calendar-current",
  "calendar-previous",
  "quarter-current",
  "custom"
] as const;
const comparisons = ["previous", "year", "none"] as const;
const grains = ["day", "week"] as const;
const risks = ["low", "medium", "high", "critical", "high_plus"] as const;
const sections = ["trend", "drivers", "matrix", "ai-drift", "quota", "risk"] as const;
const chartViews = ["graph", "table"] as const;
const seriesOrder = ["score", "volume", "previous", "target"] as const;
const evidenceTypes = ["trend", "driver", "matrix", "kpi"] as const;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const evidenceKeyPattern = /^ev1_[A-Za-z0-9_-]{43}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const recognizedKeys = new Set([
  "view",
  "period",
  "start",
  "end",
  "compare",
  "grain",
  "trend",
  "team",
  "source",
  "risk",
  "block",
  "section",
  "chartView",
  "series",
  "evidenceType",
  "evidenceKey"
]);

const emptyCatalog: ReportFilterCatalog = {
  teams: [],
  blocks: [],
  sources: []
};

function one(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

function enumValue<const T extends readonly string[]>(
  value: string | undefined,
  options: T
): T[number] | undefined {
  return value && options.includes(value as T[number])
    ? (value as T[number])
    : undefined;
}

function exactUtcDay(value: string | undefined) {
  if (!value || !datePattern.test(value)) {
    return undefined;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? undefined
    : date;
}

function boundedCustomRange(start: string | undefined, end: string | undefined) {
  const startDate = exactUtcDay(start);
  const endDate = exactUtcDay(end);

  if (!startDate || !endDate || endDate < startDate) {
    return undefined;
  }

  const inclusiveDays =
    Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
  if (!start || !end) {
    return undefined;
  }

  if (inclusiveDays <= 366) {
    return { start, end };
  }

  const clampedEnd = new Date(startDate);
  clampedEnd.setUTCDate(clampedEnd.getUTCDate() + 365);
  return {
    start,
    end: clampedEnd.toISOString().slice(0, 10)
  };
}

function allowedSlug(
  value: string | undefined,
  options: readonly ReportFilterOption[]
) {
  return value &&
    slugPattern.test(value) &&
    options.some((option) => option.slug === value)
    ? value
    : undefined;
}

function allowedSource(
  value: string | undefined,
  sources: readonly string[]
) {
  return value && sources.includes(value) ? value : undefined;
}

const sectionsByView: Record<ReportView, readonly ReportSection[]> = {
  overview: ["trend", "drivers"],
  performance: ["matrix", "drivers", "ai-drift", "quota"],
  process: ["risk"],
  details: ["matrix"]
};

function canonicalSeries(value: string | undefined): ReportSeries[] {
  if (!value) {
    return [...seriesOrder];
  }

  const requested = value.split(",");
  if (
    requested.length === 0 ||
    new Set(requested).size !== requested.length ||
    requested.some((key) => !seriesOrder.includes(key as ReportSeries))
  ) {
    return [...seriesOrder];
  }

  const result = seriesOrder.filter((key) => requested.includes(key));
  return result.length > 0 ? [...result] : [...seriesOrder];
}

export function parseReportAnalysisState(
  params: SearchInput,
  catalog: ReportFilterCatalog = emptyCatalog,
  _now = new Date()
): ReportAnalysisState {
  void _now;
  const rawPeriod = enumValue(one(params.period), periodPresets);
  const customRange =
    rawPeriod === "custom"
      ? boundedCustomRange(one(params.start), one(params.end))
      : undefined;
  const period = rawPeriod === "custom" && !customRange
    ? "vk-current"
    : rawPeriod ?? "vk-current";
  const evidenceType = enumValue(one(params.evidenceType), evidenceTypes);
  const evidenceKeyValue = one(params.evidenceKey);
  const evidenceKey =
    evidenceKeyValue && evidenceKeyPattern.test(evidenceKeyValue)
      ? evidenceKeyValue
      : undefined;
  const hasEvidencePair = Boolean(evidenceType && evidenceKey);
  const view = enumValue(one(params.view), views) ?? "overview";
  const requestedSection = enumValue(one(params.section), sections);
  const section =
    requestedSection && sectionsByView[view].includes(requestedSection)
      ? requestedSection
      : undefined;
  const legacyGrain =
    one(params.grain) === undefined
      ? one(params.trend) === "month"
        ? "week"
        : enumValue(one(params.trend), grains)
      : undefined;

  return {
    view,
    period,
    ...(period === "custom" && customRange ? customRange : {}),
    compare: enumValue(one(params.compare), comparisons) ?? "previous",
    grain: enumValue(one(params.grain), grains) ?? legacyGrain ?? "day",
    ...(allowedSlug(one(params.team), catalog.teams)
      ? { team: one(params.team) }
      : {}),
    ...(allowedSource(one(params.source), catalog.sources)
      ? { source: one(params.source) }
      : {}),
    ...(enumValue(one(params.risk), risks)
      ? { risk: enumValue(one(params.risk), risks) }
      : {}),
    ...(allowedSlug(one(params.block), catalog.blocks)
      ? { block: one(params.block) }
      : {}),
    ...(section ? { section } : {}),
    chartView: enumValue(one(params.chartView), chartViews) ?? "graph",
    series: canonicalSeries(one(params.series)),
    ...(hasEvidencePair ? { evidenceType, evidenceKey } : {})
  };
}

export function serializeReportAnalysisState(state: ReportAnalysisState) {
  const params = new URLSearchParams();
  params.set("view", state.view);
  params.set("period", state.period);
  if (state.period === "custom" && state.start && state.end) {
    params.set("start", state.start);
    params.set("end", state.end);
  }
  params.set("compare", state.compare);
  params.set("grain", state.grain);
  if (state.team) params.set("team", state.team);
  if (state.source) params.set("source", state.source);
  if (state.risk) params.set("risk", state.risk);
  if (state.block) params.set("block", state.block);
  if (state.section) params.set("section", state.section);
  params.set("chartView", state.chartView);
  params.set("series", state.series.join(","));
  if (state.evidenceType && state.evidenceKey) {
    params.set("evidenceType", state.evidenceType);
    params.set("evidenceKey", state.evidenceKey);
  }
  return `/reports?${params.toString()}`;
}

function currentHrefInput(currentHref: string) {
  if (!currentHref.startsWith("/") || currentHref.startsWith("//")) {
    throw new TypeError("Report analysis href must be application-relative");
  }

  const origin = "https://report-state.local";
  const url = new URL(currentHref, origin);
  if (url.origin !== origin || url.pathname !== "/reports") {
    throw new TypeError("Report analysis href must stay on /reports");
  }

  const input: SearchInput = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (!recognizedKeys.has(key)) {
      continue;
    }
    if (input[key] !== undefined) {
      throw new TypeError(`Duplicate report analysis key: ${key}`);
    }
    input[key] = value;
  }
  return input;
}

export function canonicalizeReportAnalysisHref(
  value: string,
  catalog: ReportFilterCatalog = emptyCatalog
) {
  const fallback = serializeReportAnalysisState(
    parseReportAnalysisState({}, catalog)
  );

  try {
    return serializeReportAnalysisState(
      parseReportAnalysisState(currentHrefInput(value), catalog)
    );
  } catch {
    return fallback;
  }
}

const filterKeys = new Set<keyof ReportAnalysisState>([
  "view",
  "period",
  "start",
  "end",
  "team",
  "source",
  "risk",
  "block",
  "section",
  "compare",
  "grain"
]);

export function buildReportAnalysisHref(
  currentHref: string,
  patch: ReportAnalysisPatch,
  catalog: ReportFilterCatalog = emptyCatalog
) {
  const input = currentHrefInput(currentHref);
  const current = parseReportAnalysisState(input, catalog);
  const changesFilter = Object.keys(patch).some((key) =>
    filterKeys.has(key as keyof ReportAnalysisState)
  );
  const next = { ...current } as ReportAnalysisState;

  for (const [key, value] of Object.entries(patch)) {
    if (value == null) {
      delete (next as unknown as Record<string, unknown>)[key];
    } else {
      (next as unknown as Record<string, unknown>)[key] = value;
    }
  }

  if (changesFilter && patch.evidenceType === undefined && patch.evidenceKey === undefined) {
    delete next.evidenceType;
    delete next.evidenceKey;
  }

  if (!next.evidenceType || !next.evidenceKey) {
    delete next.evidenceType;
    delete next.evidenceKey;
  }

  const serialized = serializeReportAnalysisState(next);
  const nextInput = currentHrefInput(serialized);
  return serializeReportAnalysisState(
    parseReportAnalysisState(nextInput, catalog)
  );
}

export function reportPresentationLinkProps(
  currentHref: string,
  patch: Pick<ReportAnalysisPatch, "chartView" | "series">,
  catalog: ReportFilterCatalog = emptyCatalog
) {
  return {
    href: buildReportAnalysisHref(currentHref, patch, catalog),
    replace: true as const
  };
}

export function reportNavigationLinkProps(
  currentHref: string,
  patch: ReportAnalysisPatch,
  catalog: ReportFilterCatalog = emptyCatalog
) {
  return {
    href: buildReportAnalysisHref(currentHref, patch, catalog),
    replace: false as const
  };
}

export function reportFilterValue(
  slug: string | undefined,
  options: readonly ReportFilterOption[]
) {
  return options.find((option) => option.slug === slug)?.value;
}
