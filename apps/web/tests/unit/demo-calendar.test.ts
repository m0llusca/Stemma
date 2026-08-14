import { describe, expect, it, vi } from "vitest";
import {
  createDemoCalendar,
  daysFrom,
  resolveDemoSeedNow
} from "../../prisma/demo-calendar";

function testEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...overrides };
}

describe("resolveDemoSeedNow", () => {
  it("accepts a complete UTC instant", () => {
    expect(
      resolveDemoSeedNow(testEnv({ DEMO_SEED_NOW: "2026-07-27T12:00:00.000Z" })).toISOString()
    ).toBe("2026-07-27T12:00:00.000Z");
  });

  it.each([
    "2026-07-27",
    "2026-07-27T12:00:00Z",
    "2026-07-27T15:00:00.000+03:00",
    "2026-02-30T12:00:00.000Z",
    " 2026-07-27T12:00:00.000Z",
    "not-a-date"
  ])("rejects ambiguous or invalid anchor %s", (value) => {
    expect(() => resolveDemoSeedNow(testEnv({ DEMO_SEED_NOW: value }))).toThrow(/DEMO_SEED_NOW/);
  });

  it("uses the current instant only when the anchor is absent", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T12:34:56.789Z"));

    try {
      expect(resolveDemoSeedNow(testEnv()).toISOString()).toBe("2026-07-27T12:34:56.789Z");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("createDemoCalendar", () => {
  it("builds inclusive rolling windows and month periods from Moscow midnight stored as UTC", () => {
    const calendar = createDemoCalendar(new Date("2026-07-27T12:00:00.000Z"));

    expect(calendar.now.toISOString()).toBe("2026-07-27T12:00:00.000Z");
    expect(calendar.startOfToday.toISOString()).toBe("2026-07-26T21:00:00.000Z");
    expect(calendar.rollingSevenDaysStart.toISOString()).toBe("2026-07-20T21:00:00.000Z");
    expect(calendar.previousSevenDaysStart.toISOString()).toBe("2026-07-13T21:00:00.000Z");
    expect(calendar.thirtyDaysStart.toISOString()).toBe("2026-06-27T21:00:00.000Z");
    expect(calendar.currentMonth.start.toISOString()).toBe("2026-06-30T21:00:00.000Z");
    expect(calendar.currentMonth.end.toISOString()).toBe("2026-07-31T20:59:59.999Z");
    expect(calendar.previousMonth.start.toISOString()).toBe("2026-05-31T21:00:00.000Z");
    expect(calendar.previousMonth.end.toISOString()).toBe("2026-06-30T20:59:59.999Z");
  });

  it.each([
    {
      anchor: "2026-07-21T12:00:00.000Z",
      currentStart: "2026-06-21T21:00:00.000Z",
      currentEnd: "2026-07-21T20:59:59.999Z",
      previousEnd: "2026-06-21T20:59:59.999Z"
    },
    {
      anchor: "2026-07-22T12:00:00.000Z",
      currentStart: "2026-07-21T21:00:00.000Z",
      currentEnd: "2026-08-21T20:59:59.999Z",
      previousEnd: "2026-07-21T20:59:59.999Z"
    },
    {
      anchor: "2026-07-31T23:59:59.999Z",
      currentStart: "2026-07-21T21:00:00.000Z",
      currentEnd: "2026-08-21T20:59:59.999Z",
      previousEnd: "2026-07-21T20:59:59.999Z"
    },
    {
      anchor: "2026-12-31T23:59:59.999Z",
      currentStart: "2026-12-21T21:00:00.000Z",
      currentEnd: "2027-01-21T20:59:59.999Z",
      previousEnd: "2026-12-21T20:59:59.999Z"
    }
  ])("uses report-period boundaries at $anchor", ({ anchor, currentStart, currentEnd, previousEnd }) => {
    const calendar = createDemoCalendar(new Date(anchor));

    expect(calendar.currentVkPeriod.start.toISOString()).toBe(currentStart);
    expect(calendar.currentVkPeriod.end.toISOString()).toBe(currentEnd);
    expect(calendar.previousVkPeriod.end.toISOString()).toBe(previousEnd);
    expect(calendar.previousVkPeriod.end.getTime() + 1).toBe(
      calendar.currentVkPeriod.start.getTime()
    );
  });

  it("keeps calendar-month and semantic helpers correct across a year rollover", () => {
    const calendar = createDemoCalendar(new Date("2026-12-31T23:59:59.999Z"));

    expect(calendar.currentMonth.start.toISOString()).toBe("2026-12-31T21:00:00.000Z");
    expect(calendar.currentMonth.end.toISOString()).toBe("2027-01-31T20:59:59.999Z");
    expect(calendar.previousMonth.start.toISOString()).toBe("2026-11-30T21:00:00.000Z");
    expect(calendar.previousMonth.end.toISOString()).toBe("2026-12-31T20:59:59.999Z");
    expect(daysFrom(calendar, 1).toISOString()).toBe("2027-01-01T21:00:00.000Z");
    expect(daysFrom(calendar, -31, { hour: 8, minute: 15, second: 30 }).toISOString()).toBe(
      "2026-12-01T05:15:30.000Z"
    );
  });
});
