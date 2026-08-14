import { describe, expect, it } from "vitest";
import {
  MAX_REPORT_TREND_BUCKETS,
  buildScoreTrendRows,
  resolveReportTrendGranularity,
  type ReportTrendGranularity,
  type ReportTrendReview
} from "@/lib/report-trends";
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

    expect(rows).toHaveLength(30);
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
    expect(rows[2]).toMatchObject({
      label: "24.04",
      value: null,
      detail: "0 проверок",
      count: 0,
      href: "/reviews?finalizedFrom=2026-04-24&finalizedTo=2026-04-24"
    });
    expect(rows.at(-1)).toMatchObject({
      label: "21.05",
      value: null,
      detail: "0 проверок",
      count: 0,
      href: "/reviews?finalizedFrom=2026-05-21&finalizedTo=2026-05-21"
    });
  });

  it("materializes a truthful null bucket between two real daily observations", () => {
    const threeDayPeriod: ReportPeriod = {
      preset: "custom",
      start: new Date("2026-07-01T00:00:00.000Z"),
      end: new Date("2026-07-03T23:59:59.999Z"),
      label: "1–3 июля"
    };

    const rows = buildScoreTrendRows(
      [
        review("2026-07-01T10:00:00.000Z", 72),
        review("2026-07-03T10:00:00.000Z", 86)
      ],
      threeDayPeriod,
      "day",
      (start, end) =>
        `/reviews?finalizedFrom=${reportDateInputValue(start)}&finalizedTo=${reportDateInputValue(end)}`
    );

    expect(rows).toHaveLength(3);
    expect(rows.map((row) => ({
      label: row.label,
      value: row.value,
      detail: row.detail,
      count: row.count,
      href: row.href
    }))).toEqual([
      {
        label: "01.07",
        value: 72,
        detail: "1 проверка",
        count: 1,
        href: "/reviews?finalizedFrom=2026-07-01&finalizedTo=2026-07-01"
      },
      {
        label: "02.07",
        value: null,
        detail: "0 проверок",
        count: 0,
        href: "/reviews?finalizedFrom=2026-07-02&finalizedTo=2026-07-02"
      },
      {
        label: "03.07",
        value: 86,
        detail: "1 проверка",
        count: 1,
        href: "/reviews?finalizedFrom=2026-07-03&finalizedTo=2026-07-03"
      }
    ]);
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
      ["06.05-12.05", null, "0 проверок"],
      ["13.05-19.05", null, "0 проверок"],
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

  it("materializes an empty calendar month between clipped edge months", () => {
    const crossMonthPeriod: ReportPeriod = {
      preset: "custom",
      start: new Date("2026-04-22T00:00:00.000Z"),
      end: new Date("2026-06-02T23:59:59.999Z"),
      label: "22 апреля – 2 июня"
    };

    const rows = buildScoreTrendRows(
      [
        review("2026-04-22T10:00:00.000Z", 70),
        review("2026-06-01T10:00:00.000Z", 90)
      ],
      crossMonthPeriod,
      "month"
    );

    expect(rows.map((row) => [row.label, row.value, row.detail])).toEqual([
      ["22.04-30.04", 70, "1 проверка"],
      ["01.05-31.05", null, "0 проверок"],
      ["01.06-02.06", 90, "1 проверка"]
    ]);
  });

  it.each<ReportTrendGranularity>(["day", "week", "month"])(
    "rejects an adversarial %s range before materializing unbounded buckets",
    (granularity) => {
      const adversarialPeriod: ReportPeriod = {
        preset: "custom",
        start: new Date("0001-01-01T00:00:00.000Z"),
        end: new Date("9999-12-31T23:59:59.999Z"),
        label: "Adversarial"
      };

      expect(MAX_REPORT_TREND_BUCKETS).toBe(400);
      expect(() =>
        buildScoreTrendRows([], adversarialPeriod, granularity)
      ).toThrowError(
        new RangeError(
          `Report trend ${granularity} range exceeds the ${MAX_REPORT_TREND_BUCKETS}-bucket safety limit.`
        )
      );
    }
  );

  it.each([
    ["day", "2020-01-01T00:00:00.000Z", "2021-02-03T23:59:59.999Z"],
    ["week", "2020-01-01T00:00:00.000Z", "2027-08-31T23:59:59.999Z"],
    ["month", "2000-01-01T00:00:00.000Z", "2033-04-30T23:59:59.999Z"]
  ] satisfies Array<[ReportTrendGranularity, string, string]>)(
    "allows exactly the 400-bucket %s safety boundary",
    (granularity, start, end) => {
      const boundaryPeriod: ReportPeriod = {
        preset: "custom",
        start: new Date(start),
        end: new Date(end),
        label: "Boundary"
      };

      expect(
        buildScoreTrendRows([], boundaryPeriod, granularity)
      ).toHaveLength(MAX_REPORT_TREND_BUCKETS);
    }
  );
});
