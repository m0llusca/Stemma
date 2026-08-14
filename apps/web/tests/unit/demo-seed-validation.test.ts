import { describe, expect, it } from "vitest";
import { createDemoCalendar, daysFrom, type DemoCalendar } from "../../prisma/demo-calendar";
import {
  buildDemoOperationalStatusPlan,
  buildOperationalConversationSeeds
} from "../../prisma/demo-operational-seeds";
import {
  buildDemoAnalyticalScenario,
  buildTwoMonthReviewedConversationSeeds
} from "../../prisma/demo-review-seeds";
import {
  DemoSeedInvariantError,
  validateDemoAnalyticalScenario,
  validateDemoOperationalSeeds,
  validateDemoOperationalStatusPlan,
  validateDemoReviewSeeds,
  validateDemoScenario
} from "../../prisma/demo-seed-validation";

const reviewContext = {
  analystId: "qa-1",
  teamLeadId: "lead-1",
  seniorAnalystId: "qa-2",
  supportAgentName: "Иван Петров",
  supportOlgaName: "Ольга Иванова",
  supportDenisName: "Денис Соколов",
  supportElenaName: "Елена Морозова"
};

const operationalContext = {
  ...reviewContext,
  analystName: "Проверяющий",
  teamLeadName: "Руководитель контроля качества",
  seniorAnalystName: "Мария Кузнецова"
};

function buildScenario(calendar: DemoCalendar) {
  return {
    calendar,
    reviewedSeeds: buildTwoMonthReviewedConversationSeeds(reviewContext, calendar),
    operationalSeeds: buildOperationalConversationSeeds(operationalContext, calendar),
    statusPlan: buildDemoOperationalStatusPlan()
  };
}

function expectInvariant(
  validate: () => void,
  scenarioId: string,
  invariant: RegExp
) {
  try {
    validate();
    throw new Error("Expected demo seed validation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(DemoSeedInvariantError);
    expect(error).toMatchObject({ scenarioId });
    expect((error as Error).message).toMatch(invariant);
  }
}

describe("demo seed scenario validation", () => {
  const calendar = createDemoCalendar(new Date("2026-07-27T12:00:00.000Z"));

  it("accepts the complete current demo scenario", () => {
    expect(() => validateDemoScenario(buildScenario(calendar))).not.toThrow();
  });

  it("names the review whose finalizedAt is in the future", () => {
    const reviewedSeeds = buildScenario(calendar).reviewedSeeds;
    const invalid = {
      ...reviewedSeeds[0],
      finalizedAt: daysFrom(calendar, 1)
    };

    expectInvariant(
      () => validateDemoReviewSeeds([invalid, ...reviewedSeeds.slice(1)], calendar),
      invalid.externalId,
      /externalId=.*finalizedAt.*future/i
    );
  });

  it("names the review whose timestamps are out of chronological order", () => {
    const reviewedSeeds = buildScenario(calendar).reviewedSeeds;
    const invalid = {
      ...reviewedSeeds[0],
      openedAt: reviewedSeeds[0].finalizedAt
    };

    expectInvariant(
      () => validateDemoReviewSeeds([invalid, ...reviewedSeeds.slice(1)], calendar),
      invalid.externalId,
      /openedAt.*closedAt.*finalizedAt/i
    );
  });

  it("requires reviews in both current and previous 22-21 periods", () => {
    const reviewedSeeds = buildScenario(calendar).reviewedSeeds;
    const withoutCurrent = reviewedSeeds.filter(
      (seed) => seed.finalizedAt < calendar.currentVkPeriod.start
    );
    const withoutPrevious = reviewedSeeds.filter(
      (seed) =>
        seed.finalizedAt < calendar.previousVkPeriod.start ||
        seed.finalizedAt > calendar.previousVkPeriod.end
    );

    expectInvariant(
      () => validateDemoReviewSeeds(withoutCurrent, calendar),
      "review-coverage",
      /current.*22-21.*period/i
    );
    expectInvariant(
      () => validateDemoReviewSeeds(withoutPrevious, calendar),
      "review-coverage",
      /previous.*22-21.*period/i
    );
  });

  it("requires reviews in both rolling seven-day windows", () => {
    const lateCalendar = createDemoCalendar(new Date("2026-08-20T12:00:00.000Z"));
    const reviewedSeeds = buildScenario(lateCalendar).reviewedSeeds;
    const withoutCurrentWindow = reviewedSeeds.filter(
      (seed) => seed.finalizedAt < lateCalendar.rollingSevenDaysStart
    );
    const currentPeriodFallback = {
      ...reviewedSeeds[0],
      externalId: "CURRENT-PERIOD-FALLBACK",
      openedAt: daysFrom(lateCalendar, -20, { hour: 9 }),
      closedAt: daysFrom(lateCalendar, -20, { hour: 10 }),
      finalizedAt: daysFrom(lateCalendar, -20, { hour: 11 })
    };
    const withoutPreviousWindow = reviewedSeeds.filter(
      (seed) =>
        seed.finalizedAt < lateCalendar.previousSevenDaysStart ||
        seed.finalizedAt >= lateCalendar.rollingSevenDaysStart
    );

    expectInvariant(
      () =>
        validateDemoReviewSeeds(
          [currentPeriodFallback, ...withoutCurrentWindow],
          lateCalendar
        ),
      "review-coverage",
      /current rolling seven-day window/i
    );
    expectInvariant(
      () => validateDemoReviewSeeds(withoutPreviousWindow, lateCalendar),
      "review-coverage",
      /previous rolling seven-day window/i
    );
  });

  it("requires all queue statuses", () => {
    const operationalSeeds = buildScenario(calendar).operationalSeeds;
    const withoutReopened = operationalSeeds.filter(
      (seed) => seed.qaStatus !== "REOPENED"
    );

    expectInvariant(
      () => validateDemoOperationalSeeds(withoutReopened, calendar),
      "queue-coverage",
      /qaStatus.*REOPENED/i
    );
  });

  it("requires overdue, today, soon, and in-time SLA buckets", () => {
    const operationalSeeds = buildScenario(calendar).operationalSeeds;
    const cases = [
      {
        name: "overdue",
        seeds: operationalSeeds.filter(
          (seed) => seed.reviewDueAt >= calendar.startOfToday
        )
      },
      {
        name: "today",
        seeds: operationalSeeds.filter(
          (seed) =>
            seed.reviewDueAt < calendar.startOfToday ||
            seed.reviewDueAt >= daysFrom(calendar, 1)
        )
      },
      {
        name: "soon",
        seeds: operationalSeeds.filter(
          (seed) =>
            seed.reviewDueAt < daysFrom(calendar, 1) ||
            seed.reviewDueAt >= daysFrom(calendar, 3)
        )
      },
      {
        name: "in-time",
        seeds: operationalSeeds.filter(
          (seed) => seed.reviewDueAt < daysFrom(calendar, 3)
        )
      }
    ];

    for (const testCase of cases) {
      expectInvariant(
        () => validateDemoOperationalSeeds(testCase.seeds, calendar),
        "sla-coverage",
        new RegExp(`SLA.*${testCase.name}`, "i")
      );
    }
  });

  it("requires every supported risk level", () => {
    const reviewedSeeds = buildScenario(calendar).reviewedSeeds;
    const withoutCritical = reviewedSeeds.filter(
      (seed) => seed.riskLevel !== "CRITICAL"
    );

    expectInvariant(
      () => validateDemoReviewSeeds(withoutCritical, calendar),
      "risk-coverage",
      /riskLevel.*CRITICAL/i
    );
  });

  it("requires minimum source, agent, team, and category counts", () => {
    const reviewedSeeds = buildScenario(calendar).reviewedSeeds;
    const cases = [
      {
        name: "sources",
        seeds: reviewedSeeds.map((seed) => ({
          ...seed,
          externalSource: "single-source"
        }))
      },
      {
        name: "agents",
        seeds: reviewedSeeds.map((seed) => ({
          ...seed,
          assigneeName: "Один оператор"
        }))
      },
      {
        name: "teams",
        seeds: reviewedSeeds.map((seed) => ({
          ...seed,
          teamName: "Одна команда"
        }))
      },
      {
        name: "categories",
        seeds: reviewedSeeds.map((seed) => ({
          ...seed,
          category: "Одна категория"
        }))
      }
    ];

    for (const testCase of cases) {
      expectInvariant(
        () => validateDemoReviewSeeds(testCase.seeds, calendar),
        "review-coverage",
        new RegExp(`minimum.*${testCase.name}`, "i")
      );
    }
  });

  it("names an operational conversation with invalid event chronology", () => {
    const operationalSeeds = buildScenario(calendar).operationalSeeds;
    const invalid = {
      ...operationalSeeds[0],
      messages: operationalSeeds[0].messages.map((message, index) =>
        index === 0
          ? { ...message, sentAt: daysFrom(calendar, -3) }
          : message
      )
    };

    expectInvariant(
      () =>
        validateDemoOperationalSeeds(
          [invalid, ...operationalSeeds.slice(1)],
          calendar
        ),
      invalid.externalId,
      /openedAt.*messages.*chronological/i
    );
  });

  it("names the first mismatched saved report view with its differing fields", () => {
    const scenario = buildDemoAnalyticalScenario(reviewContext, calendar);
    scenario.savedViews[0] = {
      ...scenario.savedViews[0],
      href: "/reports?invalid=1"
    };

    expectInvariant(
      () => validateDemoAnalyticalScenario(scenario, calendar),
      "saved-view.high-plus",
      /demo-saved-report-high-plus.*href: expected .*received "\/reports\?invalid=1"/
    );
  });

  it("requires every training, calibration, integration, job, and snapshot status", () => {
    const validPlan = buildDemoOperationalStatusPlan();
    const cases = [
      {
        key: "trainingAssignmentStatuses",
        missing: "done",
        plan: { ...validPlan, trainingAssignmentStatuses: ["open", "in_progress"] }
      },
      {
        key: "calibrationSessionStatuses",
        missing: "archived",
        plan: {
          ...validPlan,
          calibrationSessionStatuses: ["draft", "active", "completed"]
        }
      },
      {
        key: "integrationStatuses",
        missing: "error",
        plan: {
          ...validPlan,
          integrationStatuses: ["active", "ready", "queued", "paused"]
        }
      },
      {
        key: "integrationRunStatuses",
        missing: "failed",
        plan: {
          ...validPlan,
          integrationRunStatuses: [
            "dry_run_ok",
            "imported",
            "queued",
            "dry_run_queued",
            "retry_scheduled"
          ]
        }
      },
      {
        key: "backendJobStatuses",
        missing: "CANCELLED",
        plan: {
          ...validPlan,
          backendJobStatuses: ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED"]
        }
      },
      {
        key: "reportSnapshotStatuses",
        missing: "FAILED",
        plan: {
          ...validPlan,
          reportSnapshotStatuses: ["QUEUED", "READY"]
        }
      }
    ];

    for (const testCase of cases) {
      expectInvariant(
        () => validateDemoOperationalStatusPlan(testCase.plan),
        `status-plan.${testCase.key}`,
        new RegExp(`${testCase.key}.*${testCase.missing}`, "i")
      );
    }
  });
});
