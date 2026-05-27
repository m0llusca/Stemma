import { describe, expect, it } from "vitest";
import { buildScoreTrendRows, resolveReportTrendGranularity, type ReportTrendReview } from "@/lib/report-trends";
import { reportDateInputValue, type ReportPeriod } from "@/lib/report-period";

const period: ReportPeriod = {
  preset: "custom",
  start: new Date("2026-04-22T00:00:00.000Z"),
  end: new Date("2026-05-21T23:59:59.999Z"),
  label: "Произвольный период"
};

function review(finalizedAt: string, totalScore: number): ReportTrendReview {
  return {
    finalizedAt: new Date(finalizedAt),
    totalScore
  };
}

describe("report trend helpers", () => {
  it("defaults to day granularity and rejects unknown values", () => {
    expect(resolveReportTrendGranularity({})).toBe("day");
    expect(resolveReportTrendGranularity({ trend: "week" })).toBe("week");
    expect(resolveReportTrendGranularity({ trend: "month" })).toBe("month");
    expect(resolveReportTrendGranularity({ trend: "hour" })).toBe("day");
  });

  it("groups daily trend points and preserves exact drilldown ranges", () => {
    const rows = buildScoreTrendRows(
      [
        review("2026-04-22T10:00:00.000Z", 72.6),
        review("2026-04-22T16:00:00.000Z", 74.4),
        review("2026-04-23T12:00:00.000Z", 81),
        review("2026-05-22T12:00:00.000Z", 99)
      ],
      period,
      "day",
      (start, end) => `/reviews?finalizedFrom=${reportDateInputValue(start)}&finalizedTo=${reportDateInputValue(end)}`
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      label: "22.04",
      value: 74,
      detail: "2 проверки",
      href: "/reviews?finalizedFrom=2026-04-22&finalizedTo=2026-04-22"
    });
    expect(rows[1]).toMatchObject({
      label: "23.04",
      value: 81,
      detail: "1 проверка"
    });
  });

  it("groups weekly trend points relative to the selected period", () => {
    const rows = buildScoreTrendRows(
      [
        review("2026-04-22T10:00:00.000Z", 70),
        review("2026-04-28T10:00:00.000Z", 80),
        review("2026-04-29T10:00:00.000Z", 90),
        review("2026-05-21T10:00:00.000Z", 100)
      ],
      period,
      "week"
    );

    expect(rows.map((row) => [row.label, row.value, row.detail])).toEqual([
      ["22.04-28.04", 75, "2 проверки"],
      ["29.04-05.05", 90, "1 проверка"],
      ["20.05-21.05", 100, "1 проверка"]
    ]);
  });

  it("groups monthly trend points by calendar month while clipping to the selected period", () => {
    const rows = buildScoreTrendRows(
      [
        review("2026-04-22T10:00:00.000Z", 70),
        review("2026-04-30T10:00:00.000Z", 80),
        review("2026-05-01T10:00:00.000Z", 90),
        review("2026-05-21T10:00:00.000Z", 100)
      ],
      period,
      "month"
    );

    expect(rows.map((row) => [row.label, row.value, row.detail])).toEqual([
      ["22.04-30.04", 75, "2 проверки"],
      ["01.05-21.05", 95, "2 проверки"]
    ]);
  });
});
