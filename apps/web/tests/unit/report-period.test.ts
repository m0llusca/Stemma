import { describe, expect, it } from "vitest";
import {
  reportDateInputValue,
  reportPeriodDateLabel,
  resolvePreviousReportPeriod,
  resolveReportPeriod
} from "@/lib/report-period";

describe("report period helpers", () => {
  it("defaults to the current 22-21 quality period", () => {
    const period = resolveReportPeriod({}, new Date("2026-05-02T12:00:00.000Z"));

    expect(reportDateInputValue(period.start)).toBe("2026-04-22");
    expect(reportDateInputValue(period.end)).toBe("2026-05-21");
    expect(reportPeriodDateLabel(period.end)).toBe("21.05.2026");
  });

  it("builds a comparable previous period", () => {
    const period = resolveReportPeriod(
      { period: "custom", start: "2026-04-01", end: "2026-04-30" },
      new Date("2026-05-02T12:00:00.000Z")
    );
    const previous = resolvePreviousReportPeriod(period);

    expect(reportDateInputValue(previous.start)).toBe("2026-03-02");
    expect(reportDateInputValue(previous.end)).toBe("2026-03-31");
  });
});
