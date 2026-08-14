import { describe, expect, it } from "vitest";
import { createDemoCalendar } from "../../prisma/demo-calendar";
import {
  buildDemoAnalyticalScenario,
  type DemoAnalyticalScenario
} from "../../prisma/demo-review-seeds";
import {
  DemoSeedInvariantError,
  validateDemoAnalyticalScenario
} from "../../prisma/demo-seed-validation";

const anchor = new Date("2026-07-28T09:00:00.000Z");
const calendar = createDemoCalendar(anchor);
const context = {
  analystId: "qa-1",
  teamLeadId: "lead-1",
  seniorAnalystId: "qa-2",
  supportAgentName: "Иван Петров",
  supportOlgaName: "Ольга Иванова",
  supportDenisName: "Денис Соколов",
  supportElenaName: "Елена Морозова"
};

function scenario() {
  return buildDemoAnalyticalScenario(context, calendar);
}

function expectScenarioFailure(
  mutate: (value: DemoAnalyticalScenario) => DemoAnalyticalScenario,
  scenarioId: string
) {
  expect(() => validateDemoAnalyticalScenario(mutate(scenario()), calendar)).toThrowError(
    expect.objectContaining({
      name: "DemoSeedInvariantError",
      scenarioId
    }) as DemoSeedInvariantError
  );
}

describe("bounded analytical demo scenario", () => {
  it("builds the exact current-relative 42 + 42 manifest at Moscow boundaries", () => {
    const value = scenario();
    const previous = value.reviews.filter((review) => review.window === "previous");
    const current = value.reviews.filter((review) => review.window === "current");

    expect(calendar.startOfToday.toISOString()).toBe("2026-07-27T21:00:00.000Z");
    expect(calendar.rollingThirtyFiveDaysStart.toISOString()).toBe("2026-06-23T21:00:00.000Z");
    expect(calendar.previousThirtyFiveDaysStart.toISOString()).toBe("2026-05-19T21:00:00.000Z");
    expect(calendar.previousThirtyFiveDaysEnd.toISOString()).toBe("2026-06-23T20:59:59.999Z");
    expect(previous).toHaveLength(42);
    expect(current).toHaveLength(42);
    expect(previous[0]).toMatchObject({
      conversationId: "demo-conversation-p01",
      reviewId: "demo-review-p01",
      findingId: "demo-finding-p01"
    });
    expect(current.at(-1)).toMatchObject({
      conversationId: "demo-conversation-c42",
      reviewId: "demo-review-c42",
      findingId: "demo-finding-c42",
      finalizedAt: new Date("2026-07-28T08:35:00.000Z")
    });
    expect(value.reviews.every((review) => review.finalizedAt <= anchor)).toBe(true);
    expect(new Set(value.reviews.map((review) => review.finalizedAt.toISOString().slice(0, 10))).size).toBe(14);
  });

  it("moves the final six slots to the preceding Moscow day when the anchor is before 11:35", () => {
    const earlyCalendar = createDemoCalendar(
      new Date("2026-07-28T02:00:00.000Z")
    );
    const early = buildDemoAnalyticalScenario(context, earlyCalendar);

    expect(early.reviews).toHaveLength(84);
    expect(early.reviews.every((review) => review.finalizedAt <= earlyCalendar.now)).toBe(
      true
    );
    expect(
      new Set(
        early.reviews
          .filter((review) => review.window === "current")
          .map((review) => review.finalizedAt.toISOString().slice(0, 10))
      ).size
    ).toBe(7);
  });

  it("provides exact bounded analytical breadth and honest edge cases", () => {
    const value = scenario();

    expect(new Set(value.reviews.map((review) => review.assigneeName))).toHaveLength(12);
    expect(new Set(value.reviews.map((review) => review.teamSlug))).toEqual(
      new Set(["process-escalations", "fgis-services", "account-commerce"])
    );
    expect(new Set(value.reviews.map((review) => review.externalSource))).toHaveLength(7);
    expect(value.criteria).toHaveLength(16);
    expect(new Set(value.criteria.map((criterion) => criterion.blockKey))).toHaveLength(4);
    expect(value.reviews.flatMap((review) => review.criterionValues)).toHaveLength(84 * 16);
    expect(new Set(value.reviews.map((review) => review.riskLevel))).toEqual(
      new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"])
    );
    expect(value.reviews.every((review) => review.sentiment === null)).toBe(true);
    expect(value.reviews.some((review) => review.assigneeName.length > 32)).toBe(true);
    expect(value.reviews.some((review) => review.subject.length > 60)).toBe(true);
    expect(value.reviews.filter((review) => review.window === "current" && review.feedbackAckAt)).toHaveLength(4);
    expect(
      value.reviews.filter(
        (review) => review.window === "current" && review.feedbackStatus === "feedback_sent"
      )
    ).not.toHaveLength(0);
  });

  it("uses a bounded set of meaningful subjects instead of numbered cyclic filler", () => {
    const current = scenario().reviews.filter(
      (review) => review.window === "current"
    );

    expect(new Set(current.map((review) => review.subject))).toHaveLength(42);
    expect(
      current.every(
        (review) => !/контроль качества обращения \d+/i.test(review.subject)
      )
    ).toBe(true);
  });

  it("contains the named report stories with executable thresholds", () => {
    const value = scenario();
    const bySource = (source: string, window: "previous" | "current") =>
      value.reviews.filter(
        (review) => review.externalSource === source && review.window === window
      );
    const average = (rows: typeof value.reviews) =>
      rows.reduce((total, row) => total + row.totalScore, 0) / rows.length;

    expect(average(bySource("freshdesk", "previous"))).toBe(90.5);
    expect(average(bySource("freshdesk", "current"))).toBe(78.5);
    expect(average(bySource("zendesk", "previous"))).toBe(75.5);
    expect(average(bySource("zendesk", "current"))).toBe(83.5);
    expect(
      [...new Set(value.reviews.map((review) => review.externalSource))].filter(
        (source) =>
          bySource(source, "previous").length < 5 ||
          bySource(source, "current").length < 5
      )
    ).toEqual(["custom_api"]);

    const currentAppeals = value.reviews.filter(
      (review) => review.window === "current" && review.appealStatus !== "none"
    );
    expect(currentAppeals).toHaveLength(6);
    expect(
      currentAppeals.filter((review) => review.teamSlug === "process-escalations")
    ).toHaveLength(4);
    expect(value.quotas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operatorId: "demo-operator-01", plannedCount: 10 }),
        expect.objectContaining({ operatorId: "demo-operator-02", plannedCount: 14 })
      ])
    );
  });

  it("restores the OTRS-2602 critical routing fixture inside the bounded current window", () => {
    const value = scenario();
    const fixture = value.reviews.find(
      (review) =>
        review.externalSource === "otrs_family" && review.externalId === "OTRS-2602"
    );

    expect(fixture).toBeDefined();
    expect(fixture).toMatchObject({
      window: "current",
      slot: 18,
      conversationId: "demo-conversation-c18",
      reviewId: "demo-review-c18",
      findingId: "demo-finding-c18",
      externalSource: "otrs_family",
      externalId: "OTRS-2602",
      channel: "EMAIL",
      subject: "Неверный отдел для технической ошибки",
      customerName: "Илья Макаров",
      teamName: "ФГИС и государственные сервисы",
      totalScore: 58,
      riskLevel: "CRITICAL",
      criticalError: true,
      criticalCategory: "Неверная маршрутизация с потерей SLA",
      category: "Неверная маршрутизация",
      ownerType: "PROCESS",
      feedbackStatus: "appeal",
      appealStatus: "calibration",
      needsReanswer: true,
      reanswerStatus: "requested",
      sentiment: null
    });
    expect(fixture!.finalizedAt.getTime()).toBeLessThanOrEqual(anchor.getTime());
    expect(
      fixture!.openedAt <= fixture!.closedAt &&
        fixture!.closedAt <= fixture!.finalizedAt
    ).toBe(true);
    expect(fixture!.coachingActionId).toBe("demo-coaching-c18");
    expect(fixture!.coachingDueAt).toBeInstanceOf(Date);
    expect(fixture!.criterionValues).toHaveLength(16);
    expect(
      fixture!.criterionValues.every(
        (score) => score.evidenceMessageId === fixture!.agentMessageId
      )
    ).toBe(true);
    expect(fixture!.agentMessage.length).toBeGreaterThan(0);
    expect(
      value.reviews.filter((review) => review.externalId === "OTRS-2602")
    ).toHaveLength(1);
    expect(
      value.reviews.some((review) => review.externalId === "demo-ticket-c18")
    ).toBe(false);
    expect(value.reviews.find((review) => review.externalId === "demo-ticket-c06")).toMatchObject({
      externalSource: "freshdesk"
    });
    expect(value.reviews).toHaveLength(84);
    expect(value.reviews.filter((review) => review.window === "current")).toHaveLength(42);
  });

  it("creates exactly one confidence drop and one fallback spike from 12 score drafts", () => {
    const value = scenario();

    expect(value.aiDrafts).toHaveLength(12);
    expect(value.aiDrafts.every((draft) => draft.criteria.length === 16)).toBe(true);
    expect(
      value.aiDrafts.every((draft) =>
        draft.criteria.every(
          (criterion) =>
            criterion.rationale.length > 0 &&
            criterion.evidenceRef === draft.evidenceMessageId
        )
      )
    ).toBe(true);
    expect(value.aiStory.confidenceDrops).toBe(1);
    expect(value.aiStory.fallbackSpikes).toBe(1);
    expect(value.aiStory.weekly).toEqual([
      { confidence: 0.87, fallbackShare: 0 },
      { confidence: 0.86, fallbackShare: 0 },
      { confidence: 0.63, fallbackShare: 0.667 },
      { confidence: 0.65, fallbackShare: 0.667 }
    ]);
  });

  it("exposes five stable PII-minimized evidence IDs for every factor", () => {
    const value = scenario();

    expect(value.evidence).toEqual({
      "freshdesk-processes": [
        "demo-review-c01",
        "demo-review-c02",
        "demo-review-c03",
        "demo-review-c04",
        "demo-review-c05"
      ],
      "zendesk-improvement": [
        "demo-review-c09",
        "demo-review-c10",
        "demo-review-c11",
        "demo-review-c12",
        "demo-review-c13"
      ],
      "declining-team": [
        "demo-review-c03",
        "demo-review-c06",
        "demo-review-c14",
        "demo-review-c18",
        "demo-review-c24"
      ],
      "ai-drift": [
        "demo-review-c25",
        "demo-review-c28",
        "demo-review-c31",
        "demo-review-c37",
        "demo-review-c38"
      ],
      "high-plus": [
        "demo-review-c03",
        "demo-review-c06",
        "demo-review-c18",
        "demo-review-c21",
        "demo-review-c32"
      ]
    });
  });

  it("serializes the four shared saved views through the canonical report-state contract", () => {
    expect(scenario().savedViews).toEqual([
      {
        id: "demo-saved-report-high-plus",
        name: "HIGH+ риск",
        href: "/reports?view=process&period=custom&start=2026-06-24&end=2026-07-28&compare=previous&grain=week&risk=high_plus&section=risk&chartView=graph&series=score%2Cvolume%2Cprevious%2Ctarget",
        scope: "shared",
        order: 1
      },
      {
        id: "demo-saved-report-freshdesk-processes",
        name: "Freshdesk / Процессы",
        href: "/reports?view=performance&period=custom&start=2026-06-24&end=2026-07-28&compare=previous&grain=week&source=freshdesk&block=protsessy-115c88c9a245&section=drivers&chartView=graph&series=score%2Cvolume%2Cprevious%2Ctarget",
        scope: "shared",
        order: 2
      },
      {
        id: "demo-saved-report-declining-team",
        name: "Команда с просадкой",
        href: "/reports?view=performance&period=custom&start=2026-06-24&end=2026-07-28&compare=previous&grain=week&team=protsessnye-eskalatsii-bd09ed282ffa&section=drivers&chartView=graph&series=score%2Cvolume%2Cprevious%2Ctarget",
        scope: "shared",
        order: 3
      },
      {
        id: "demo-saved-report-ai-drift",
        name: "AI drift",
        href: "/reports?view=performance&period=custom&start=2026-06-24&end=2026-07-28&compare=previous&grain=week&section=ai-drift&chartView=graph&series=score%2Cvolume%2Cprevious%2Ctarget",
        scope: "shared",
        order: 4
      }
    ]);
  });

  it.each([
    ["freshdesk-processes", (value: DemoAnalyticalScenario) => ({
      ...value,
      reviews: value.reviews.map((review) =>
        review.externalSource === "freshdesk" && review.window === "current"
          ? { ...review, totalScore: review.totalScore + 12 }
          : review
      )
    })],
    ["zendesk-improvement", (value: DemoAnalyticalScenario) => ({
      ...value,
      reviews: value.reviews.map((review) =>
        review.externalSource === "zendesk" && review.window === "current"
          ? { ...review, totalScore: review.totalScore - 10 }
          : review
      )
    })],
    ["appeal-concentration", (value: DemoAnalyticalScenario) => ({
      ...value,
      reviews: value.reviews.map((review) =>
        review.appealStatus !== "none"
          ? {
              ...review,
              teamSlug: (["process-escalations", "fgis-services", "account-commerce"] as const)[
                review.slot % 3
              ]
            }
          : review
      )
    })],
    ["low-sample-source", (value: DemoAnalyticalScenario) => ({
      ...value,
      reviews: value.reviews.map((review) =>
        review.externalSource === "hubspot" && review.slot === 30
          ? { ...review, externalSource: "custom_api" }
          : review
      )
    })],
    ["ai-confidence-drop", (value: DemoAnalyticalScenario) => ({
      ...value,
      aiDrafts: value.aiDrafts.map((draft, index) =>
        index >= 6 ? { ...draft, confidence: 0.84 } : draft
      )
    })],
    ["ai-fallback-spike", (value: DemoAnalyticalScenario) => ({
      ...value,
      aiDrafts: value.aiDrafts.map((draft) => ({
        ...draft,
        modelVersion: "yandexgpt-qc-v2"
      }))
    })],
    ["quota-pair", (value: DemoAnalyticalScenario) => ({
      ...value,
      quotas: value.quotas.map((quota) => ({ ...quota, plannedCount: 42 }))
    })],
    ["coaching-states", (value: DemoAnalyticalScenario) => ({
      ...value,
      reviews: value.reviews.map((review) =>
        review.coachingDueAt
          ? {
              ...review,
              coachingDueAt: new Date(calendar.now.getTime() + 24 * 60 * 60 * 1000)
            }
          : review
      )
    })],
    ["feedback-states", (value: DemoAnalyticalScenario) => ({
      ...value,
      reviews: value.reviews.map((review) => ({
        ...review,
        feedbackAckAt: null,
        feedbackStatus:
          review.feedbackStatus === "feedback_sent" ? "new" : review.feedbackStatus
      }))
    })],
    ["reanswer-states", (value: DemoAnalyticalScenario) => ({
      ...value,
      reviews: value.reviews.map((review) => ({
        ...review,
        needsReanswer: false,
        reanswerStatus: "not_needed"
      }))
    })],
    ["evidence.freshdesk-processes", (value: DemoAnalyticalScenario) => ({
      ...value,
      evidence: { ...value.evidence, "freshdesk-processes": ["demo-review-c01"] }
    })],
    ["saved-view.high-plus", (value: DemoAnalyticalScenario) => ({
      ...value,
      savedViews: value.savedViews.filter(
        (view) => view.id !== "demo-saved-report-high-plus"
      )
    })]
  ] as const)("fails with a specific scenarioId when %s is removed", (scenarioId, mutate) => {
    expectScenarioFailure(mutate, scenarioId);
  });
});
