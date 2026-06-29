import { describe, expect, it } from "vitest";
import {
  formatAverageScore,
  formatCriterionCount,
  formatReviewCount,
  reportDeltaLabel,
  reportExportFormatHref,
  reportExportHref,
  reportHref,
  reportReviewHref,
  reportReviewRangeHref,
  resolveReportView,
  russianPlural,
  sampleInsight,
  scoreDelta,
  targetDistanceLabel,
  trendPointDeltaLabel,
  trendTone,
  trendVerdictTitle
} from "@/lib/reports/report-format";
import type { ReportPeriod } from "@/lib/report-period";

const period = {
  preset: "last-30-days",
  start: new Date("2026-05-01T00:00:00.000Z"),
  end: new Date("2026-05-31T00:00:00.000Z")
} as unknown as ReportPeriod;

describe("russianPlural", () => {
  it("uses the singular form for n ending in 1 (but not 11)", () => {
    expect(russianPlural(1, ["проверка", "проверки", "проверок"])).toBe("1 проверка");
    expect(russianPlural(21, ["проверка", "проверки", "проверок"])).toBe("21 проверка");
    expect(russianPlural(11, ["проверка", "проверки", "проверок"])).toBe("11 проверок");
  });

  it("uses the few form for n ending in 2-4 (but not 12-14)", () => {
    expect(russianPlural(2, ["проверка", "проверки", "проверок"])).toBe("2 проверки");
    expect(russianPlural(23, ["проверка", "проверки", "проверок"])).toBe("23 проверки");
    expect(russianPlural(13, ["проверка", "проверки", "проверок"])).toBe("13 проверок");
  });

  it("uses the many form for 0, 5-9 and the teens", () => {
    expect(russianPlural(0, ["проверка", "проверки", "проверок"])).toBe("0 проверок");
    expect(russianPlural(5, ["проверка", "проверки", "проверок"])).toBe("5 проверок");
    expect(russianPlural(14, ["проверка", "проверки", "проверок"])).toBe("14 проверок");
  });
});

describe("count formatting helpers", () => {
  it("formats review and criterion counts with correct plural forms", () => {
    expect(formatReviewCount(1)).toBe("1 проверка");
    expect(formatReviewCount(5)).toBe("5 проверок");
    expect(formatCriterionCount(2)).toBe("2 оценки");
    expect(formatCriterionCount(11)).toBe("11 оценок");
  });
});

describe("formatAverageScore", () => {
  it("formats a score and falls back to 'Нет данных'", () => {
    expect(formatAverageScore(94)).toBe("94 балла");
    expect(formatAverageScore(null)).toBe("Нет данных");
    expect(formatAverageScore(undefined)).toBe("Нет данных");
  });
});

describe("resolveReportView", () => {
  it("returns a valid view or defaults to overview", () => {
    expect(resolveReportView({ view: "performance" })).toBe("performance");
    expect(resolveReportView({ view: ["process", "x"] })).toBe("process");
    expect(resolveReportView({ view: "bogus" })).toBe("overview");
    expect(resolveReportView({})).toBe("overview");
  });
});

describe("scoreDelta", () => {
  it("delegates to the clamped quality delta", () => {
    expect(scoreDelta(90, 85)).toBe(5);
    expect(scoreDelta(90, null)).toBeNull();
  });
});

describe("reportDeltaLabel", () => {
  it("describes the delta against the previous period", () => {
    expect(reportDeltaLabel(null)).toBe("нет базы сравнения");
    expect(reportDeltaLabel(0)).toBe("без изменений к прошлому периоду");
    expect(reportDeltaLabel(3)).toBe("+3 балла к среднему баллу прошлого периода");
    expect(reportDeltaLabel(-2)).toBe("-2 балла к среднему баллу прошлого периода");
  });
});

describe("sampleInsight", () => {
  it("flags an empty period", () => {
    expect(sampleInsight(0, 10)).toContain("нет завершенных проверок");
  });

  it("warns when either period is too small", () => {
    expect(sampleInsight(3, 10)).toContain("Выборка мала");
    expect(sampleInsight(10, 2)).toContain("Выборка мала");
  });

  it("confirms a sufficient sample", () => {
    expect(sampleInsight(10, 10)).toContain("достаточна");
  });
});

describe("trendTone", () => {
  it("maps a delta sign onto a tone token", () => {
    expect(trendTone(null)).toBe("none");
    expect(trendTone(2)).toBe("up");
    expect(trendTone(-2)).toBe("down");
    expect(trendTone(0)).toBe("flat");
  });
});

describe("trendVerdictTitle", () => {
  it("describes the verdict given the current score and delta", () => {
    expect(trendVerdictTitle(0, null)).toBe("Оценка пока не рассчитана");
    expect(trendVerdictTitle(null, 90)).toBe("Нет базы сравнения");
    expect(trendVerdictTitle(3, 90)).toBe("Качество улучшилось");
    expect(trendVerdictTitle(-3, 90)).toBe("Качество снизилось");
    expect(trendVerdictTitle(0, 90)).toBe("Качество без изменений");
  });
});

describe("trendPointDeltaLabel", () => {
  it("labels the per-point delta", () => {
    expect(trendPointDeltaLabel(null)).toBe("первая точка периода");
    expect(trendPointDeltaLabel(0)).toBe("без изменений к предыдущей точке");
    expect(trendPointDeltaLabel(4)).toBe("+4 балла к предыдущей точке");
  });
});

describe("targetDistanceLabel", () => {
  it("reports whether a value sits in the target corridor", () => {
    expect(targetDistanceLabel(90, 85)).toBe("в целевом коридоре");
    expect(targetDistanceLabel(85, 85)).toBe("в целевом коридоре");
    expect(targetDistanceLabel(80, 85)).toBe("ниже цели на 5 баллов");
  });
});

describe("report hrefs", () => {
  it("carries the period preset and bounds into report links", () => {
    expect(reportHref(period)).toBe("/reports?period=last-30-days&start=2026-05-01&end=2026-05-31");
    expect(reportHref(period, { view: "details" })).toBe(
      "/reports?period=last-30-days&start=2026-05-01&end=2026-05-31&view=details"
    );
  });

  it("builds export links for the default and per-format routes", () => {
    expect(reportExportHref(period)).toBe("/reports/export?period=last-30-days&start=2026-05-01&end=2026-05-31");
    expect(reportExportFormatHref(period, "xlsx")).toBe(
      "/reports/export/xlsx?period=last-30-days&start=2026-05-01&end=2026-05-31"
    );
  });

  it("builds reviewed-queue drilldown links scoped to the period range", () => {
    expect(reportReviewHref(period, { riskLevel: "HIGH" })).toBe(
      "/reviews?status=reviewed&finalizedFrom=2026-05-01&finalizedTo=2026-05-31&riskLevel=HIGH"
    );
    expect(reportReviewRangeHref(period.start, period.end)).toBe(
      "/reviews?status=reviewed&finalizedFrom=2026-05-01&finalizedTo=2026-05-31"
    );
  });
});
