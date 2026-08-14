import { describe, expect, it } from "vitest";
import { buildDemoDateExpectations } from "../e2e/helpers/demo-date-expectations";

describe("buildDemoDateExpectations", () => {
  it("derives UTC report periods and Moscow-seeded operational dates from one anchor", () => {
    expect(buildDemoDateExpectations(new Date("2026-07-27T12:00:00.000Z"))).toEqual({
      reportHeadings: {
        current: "Текущий период 22-21: 22.07.2026 - 21.08.2026",
        previous: "Прошлый период 22-21: 21.06.2026 - 21.07.2026"
      },
      queueDueDates: {
        QUEUED: "26.07.2026",
        ASSIGNED: "29.07.2026",
        IN_PROGRESS: "30.07.2026",
        REOPENED: "27.07.2026"
      },
      coachingDueDates: ["27.07.2026", "28.07.2026"]
    });
  });

  it("keeps UTC calendar semantics across a year rollover", () => {
    expect(buildDemoDateExpectations(new Date("2026-12-31T23:59:59.999Z"))).toEqual({
      reportHeadings: {
        current: "Текущий период 22-21: 22.12.2026 - 21.01.2027",
        previous: "Прошлый период 22-21: 21.11.2026 - 21.12.2026"
      },
      queueDueDates: {
        QUEUED: "31.12.2026",
        ASSIGNED: "03.01.2027",
        IN_PROGRESS: "04.01.2027",
        REOPENED: "01.01.2027"
      },
      coachingDueDates: ["01.01.2027", "02.01.2027"]
    });
  });

  it("keeps UTC report headings while operational dates roll over at Moscow midnight", () => {
    const beforeMoscowMidnight = buildDemoDateExpectations(
      new Date("2026-07-27T20:59:59.999Z")
    );
    const atMoscowMidnight = buildDemoDateExpectations(
      new Date("2026-07-27T21:00:00.000Z")
    );

    expect(beforeMoscowMidnight).toEqual({
      reportHeadings: {
        current: "Текущий период 22-21: 22.07.2026 - 21.08.2026",
        previous: "Прошлый период 22-21: 21.06.2026 - 21.07.2026"
      },
      queueDueDates: {
        QUEUED: "26.07.2026",
        ASSIGNED: "29.07.2026",
        IN_PROGRESS: "30.07.2026",
        REOPENED: "27.07.2026"
      },
      coachingDueDates: ["27.07.2026", "28.07.2026"]
    });
    expect(atMoscowMidnight).toEqual({
      reportHeadings: beforeMoscowMidnight.reportHeadings,
      queueDueDates: {
        QUEUED: "27.07.2026",
        ASSIGNED: "30.07.2026",
        IN_PROGRESS: "31.07.2026",
        REOPENED: "28.07.2026"
      },
      coachingDueDates: ["28.07.2026", "29.07.2026"]
    });
  });
});
