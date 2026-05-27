import { describe, expect, it } from "vitest";
import {
  reportDateInputValue,
  reportPeriodDateLabel,
  reportPeriodUsesCustomDates,
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

  it("keeps previous-period comparison equal in length for short and leap-year ranges", () => {
    const singleDay = resolveReportPeriod(
      { period: "custom", start: "2026-05-21", end: "2026-05-21" },
      new Date("2026-05-27T12:00:00.000Z")
    );
    const leapRange = resolveReportPeriod(
      { period: "custom", start: "2024-02-28", end: "2024-03-01" },
      new Date("2026-05-27T12:00:00.000Z")
    );

    expect(reportDateInputValue(resolvePreviousReportPeriod(singleDay).start)).toBe("2026-05-20");
    expect(reportDateInputValue(resolvePreviousReportPeriod(singleDay).end)).toBe("2026-05-20");
    expect(reportDateInputValue(resolvePreviousReportPeriod(leapRange).start)).toBe("2024-02-25");
    expect(reportDateInputValue(resolvePreviousReportPeriod(leapRange).end)).toBe("2024-02-27");
  });

  it("shows manual date controls only for custom report periods", () => {
    const standard = resolveReportPeriod({ period: "vk-current" }, new Date("2026-05-27T12:00:00.000Z"));
    const custom = resolveReportPeriod(
      { period: "custom", start: "2026-05-01", end: "2026-05-10" },
      new Date("2026-05-27T12:00:00.000Z")
    );

    expect(reportPeriodUsesCustomDates(standard)).toBe(false);
    expect(reportPeriodUsesCustomDates(custom)).toBe(true);
  });

  it("keeps custom mode editable even before manual dates are chosen", () => {
    const custom = resolveReportPeriod(
      { period: "custom" },
      new Date("2026-05-27T12:00:00.000Z")
    );

    expect(custom.preset).toBe("custom");
    expect(reportPeriodUsesCustomDates(custom)).toBe(true);
    expect(reportDateInputValue(custom.start)).toBe("2026-05-22");
    expect(reportDateInputValue(custom.end)).toBe("2026-06-21");
  });
});
