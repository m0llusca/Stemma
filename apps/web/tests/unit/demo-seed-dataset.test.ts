import { describe, expect, it } from "vitest";
import { createDemoCalendar, type DemoCalendar } from "../../prisma/demo-calendar";
import {
  buildDemoOperationalStatusPlan,
  buildDemoOperationalTimeline,
  buildOperationalConversationSeeds
} from "../../prisma/demo-operational-seeds";
import { buildTwoMonthReviewedConversationSeeds } from "../../prisma/demo-review-seeds";

const DAY_MS = 24 * 60 * 60 * 1000;

const context = {
  analystId: "qa-1",
  teamLeadId: "lead-1",
  seniorAnalystId: "qa-2",
  supportAgentName: "Иван Петров",
  supportOlgaName: "Ольга Иванова",
  supportDenisName: "Денис Соколов",
  supportElenaName: "Елена Морозова"
};

function inRange(date: Date, period: DemoCalendar["currentVkPeriod"]) {
  const timestamp = date.getTime();

  return timestamp >= period.start.getTime() && timestamp <= period.end.getTime();
}

describe("two-month demo review dataset", () => {
  const calendar = createDemoCalendar(new Date("2026-07-27T12:00:00.000Z"));
  const seeds = buildTwoMonthReviewedConversationSeeds(context, calendar);

  it("fills current and previous 22-21 periods without future finalized dates", () => {
    expect(seeds.length).toBeGreaterThanOrEqual(56);
    expect(seeds.filter((seed) => inRange(seed.finalizedAt, calendar.currentVkPeriod))).not.toHaveLength(0);
    expect(seeds.filter((seed) => inRange(seed.finalizedAt, calendar.previousVkPeriod))).not.toHaveLength(0);
    expect(seeds.every((seed) => seed.finalizedAt <= calendar.now)).toBe(true);
    expect(seeds.every((seed) => seed.openedAt <= seed.closedAt && seed.closedAt <= seed.finalizedAt)).toBe(true);
  });

  it("fills both rolling seven-day windows", () => {
    expect(seeds.some((seed) => seed.finalizedAt >= calendar.rollingSevenDaysStart)).toBe(true);
    expect(
      seeds.some(
        (seed) =>
          seed.finalizedAt >= calendar.previousSevenDaysStart &&
          seed.finalizedAt < calendar.rollingSevenDaysStart
      )
    ).toBe(true);
  });

  it("keeps finalized reviews at or before now on the first day of a 22-21 period", () => {
    const periodStartCalendar = createDemoCalendar(new Date("2026-07-22T12:00:00.000Z"));
    const periodStartSeeds = buildTwoMonthReviewedConversationSeeds(context, periodStartCalendar);

    expect(periodStartSeeds.map((seed) => seed.externalId)).toEqual(seeds.map((seed) => seed.externalId));
    expect(periodStartSeeds.every((seed) => seed.finalizedAt <= periodStartCalendar.now)).toBe(true);
    expect(periodStartSeeds.some((seed) => inRange(seed.finalizedAt, periodStartCalendar.currentVkPeriod))).toBe(true);
    expect(periodStartSeeds.some((seed) => inRange(seed.finalizedAt, periodStartCalendar.previousVkPeriod))).toBe(true);
    expect(
      periodStartSeeds.some(
        (seed) =>
          seed.finalizedAt >= periodStartCalendar.rollingSevenDaysStart &&
          seed.finalizedAt <= periodStartCalendar.now
      )
    ).toBe(true);
    expect(
      periodStartSeeds.some(
        (seed) =>
          seed.finalizedAt >= periodStartCalendar.previousSevenDaysStart &&
          seed.finalizedAt < periodStartCalendar.rollingSevenDaysStart
      )
    ).toBe(true);
  });

  it("keeps both rolling windows populated late in the current 22-21 period", () => {
    const latePeriodCalendar = createDemoCalendar(new Date("2026-08-20T12:00:00.000Z"));
    const latePeriodSeeds = buildTwoMonthReviewedConversationSeeds(context, latePeriodCalendar);

    expect(latePeriodSeeds.every((seed) => seed.finalizedAt <= latePeriodCalendar.now)).toBe(true);
    expect(
      latePeriodSeeds.some(
        (seed) =>
          seed.finalizedAt >= latePeriodCalendar.rollingSevenDaysStart &&
          seed.finalizedAt <= latePeriodCalendar.now
      )
    ).toBe(true);
    expect(
      latePeriodSeeds.some(
        (seed) =>
          seed.finalizedAt >= latePeriodCalendar.previousSevenDaysStart &&
          seed.finalizedAt < latePeriodCalendar.rollingSevenDaysStart
      )
    ).toBe(true);
  });

  it("covers enough operational variety for reports and demo drilldowns", () => {
    expect(new Set(seeds.map((seed) => seed.externalSource)).size).toBeGreaterThanOrEqual(6);
    expect(new Set(seeds.map((seed) => seed.assigneeName)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(seeds.map((seed) => seed.teamName)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(seeds.map((seed) => seed.reviewerId)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(seeds.map((seed) => seed.category)).size).toBeGreaterThanOrEqual(8);
    expect(new Set(seeds.map((seed) => seed.samplingType)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(seeds.map((seed) => seed.feedbackStatus)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(seeds.map((seed) => seed.riskLevel))).toEqual(new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]));
    expect(seeds.filter((seed) => seed.needsReanswer).map((seed) => seed.reviewId)).toEqual([
      "demo-review-c03",
      "demo-review-c14",
      "demo-review-c18",
      "demo-review-c32"
    ]);
    expect(seeds.filter((seed) => seed.appealStatus && seed.appealStatus !== "none").length).toBeGreaterThanOrEqual(6);
  });

  it("provides dense, non-round trend data for charts and tooltips", () => {
    const trendDays = new Map<string, number>();
    for (const seed of seeds) {
      const key = seed.finalizedAt.toISOString().slice(0, 10);
      trendDays.set(key, (trendDays.get(key) ?? 0) + 1);
    }
    const latest = [...seeds].sort((left, right) => right.finalizedAt.getTime() - left.finalizedAt.getTime())[0];

    expect(trendDays.size).toBeGreaterThanOrEqual(14);
    expect([...trendDays.values()].some((count) => count > 1)).toBe(true);
    expect(new Set(seeds.map((seed) => seed.totalScore)).size).toBeGreaterThanOrEqual(12);
    expect(seeds.some((seed) => seed.totalScore % 5 !== 0)).toBe(true);
    expect(latest.finalizedAt <= calendar.now).toBe(true);
    expect(latest.assigneeName).not.toBe("");
    expect(latest.category).not.toBe("");
  });
});

describe("operational demo dataset", () => {
  const calendar = createDemoCalendar(new Date("2026-07-27T12:00:00.000Z"));
  const operationalContext = {
    ...context,
    analystName: "Проверяющий",
    teamLeadName: "Руководитель контроля качества",
    seniorAnalystName: "Мария Кузнецова"
  };
  const seeds = buildOperationalConversationSeeds(operationalContext, calendar);
  const reviewedSeeds = buildTwoMonthReviewedConversationSeeds(context, calendar);
  const statusPlan = buildDemoOperationalStatusPlan();
  const timeline = buildDemoOperationalTimeline(calendar);

  it("adds open and in-flight review queue states instead of only finalized checks", () => {
    const dueOffsets = seeds.map((seed) =>
      Math.round((seed.reviewDueAt.getTime() - calendar.startOfToday.getTime()) / DAY_MS)
    );

    expect(seeds.length).toBeGreaterThanOrEqual(10);
    expect(new Set(seeds.map((seed) => seed.qaStatus))).toEqual(new Set(["QUEUED", "ASSIGNED", "IN_PROGRESS", "REOPENED"]));
    expect(new Set(seeds.map((seed) => seed.status))).toEqual(new Set(["open", "pending", "solved", "closed"]));
    expect(new Set(seeds.map((seed) => seed.channel)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(seeds.map((seed) => seed.assigneeName ?? "Не назначен")).size).toBeGreaterThanOrEqual(5);
    expect(new Set(seeds.map((seed) => seed.teamName)).size).toBeGreaterThanOrEqual(3);
    expect(dueOffsets.some((value) => value < 0)).toBe(true);
    expect(dueOffsets).toContain(0);
    expect(dueOffsets.some((value) => value > 0 && value <= 2)).toBe(true);
    expect(dueOffsets.some((value) => value > 2)).toBe(true);
    expect(seeds.some((seed) => seed.draftReview)).toBe(true);
    expect(seeds.some((seed) => seed.previousFinalizedReview)).toBe(true);
  });

  it("keeps operational conversation and review chronology valid", () => {
    for (const seed of seeds) {
      expect(seed.openedAt <= seed.messages[0].sentAt).toBe(true);
      expect(seed.messages.every((message, index) => index === 0 || seed.messages[index - 1].sentAt <= message.sentAt)).toBe(true);

      if (seed.closedAt === null) {
        expect(["open", "pending"]).toContain(seed.status);
      } else if (seed.closedAt !== undefined) {
        expect(seed.messages.at(-1)!.sentAt <= seed.closedAt).toBe(true);
      }

      if (seed.previousFinalizedReview?.finalizedAt) {
        expect(seed.closedAt).toBeInstanceOf(Date);
        expect(seed.closedAt!.getTime()).toBeLessThanOrEqual(seed.previousFinalizedReview.finalizedAt.getTime());
        expect(seed.previousFinalizedReview.finalizedAt <= calendar.now).toBe(true);
      }
    }
  });

  it("covers non-review operational states across demo sections", () => {
    expect(new Set(statusPlan.trainingAssignmentStatuses)).toEqual(new Set(["open", "in_progress", "done"]));
    expect(new Set(statusPlan.calibrationSessionStatuses)).toEqual(new Set(["draft", "active", "completed", "archived"]));
    expect(new Set(statusPlan.integrationStatuses)).toEqual(new Set(["active", "ready", "queued", "paused", "error"]));
    expect(new Set(statusPlan.integrationRunStatuses)).toEqual(
      new Set(["dry_run_ok", "imported", "queued", "dry_run_queued", "retry_scheduled", "failed"])
    );
    expect(new Set(statusPlan.backendJobStatuses)).toEqual(new Set(["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"]));
    expect(new Set(statusPlan.reportSnapshotStatuses)).toEqual(new Set(["QUEUED", "READY", "FAILED"]));
  });

  it("anchors quotas and snapshots to the current reporting calendar", () => {
    expect(timeline.quotas.previous).toEqual(calendar.previousVkPeriod);
    expect(timeline.quotas.current).toEqual(calendar.currentVkPeriod);

    expect(timeline.reportSnapshots.ready.period).toEqual(calendar.currentVkPeriod);
    expect(timeline.reportSnapshots.queue.period.start).toEqual(calendar.startOfToday);
    expect(timeline.reportSnapshots.queue.period.end.getTime()).toBeGreaterThan(calendar.startOfToday.getTime());
    expect(timeline.reportSnapshots.failed.period.start).toEqual(calendar.rollingSevenDaysStart);
    expect(timeline.reportSnapshots.failed.period.end.getTime()).toBeGreaterThanOrEqual(calendar.now.getTime());

    for (const snapshot of Object.values(timeline.reportSnapshots)) {
      expect(snapshot.createdAt <= calendar.now).toBe(true);
    }
  });

  it("places training and calibration states on both sides of today", () => {
    for (const item of [
      ...timeline.training.open,
      ...timeline.training.inProgress,
      ...timeline.training.done
    ]) {
      expect(item).toEqual(
        expect.objectContaining({
          dueAt: expect.any(Date),
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date)
        })
      );
      expect(item.createdAt <= item.updatedAt).toBe(true);
      expect(item.updatedAt <= calendar.now).toBe(true);
    }
    expect(timeline.training.open.every((item) => item.dueAt < calendar.startOfToday)).toBe(true);
    expect(
      timeline.training.inProgress.every(
        (item) =>
          item.dueAt >= calendar.startOfToday &&
          item.dueAt < new Date(calendar.startOfToday.getTime() + 3 * DAY_MS)
      )
    ).toBe(true);
    expect(
      timeline.training.done.every(
        (item) =>
          item.dueAt < calendar.startOfToday &&
          item.updatedAt < calendar.startOfToday &&
          reviewedSeeds.some((seed) => seed.finalizedAt < item.updatedAt) &&
          reviewedSeeds.some((seed) => seed.finalizedAt >= item.updatedAt)
      )
    ).toBe(true);

    expect(timeline.calibrations.draft.dueAt > calendar.now).toBe(true);
    expect(timeline.calibrations.active.dueAt > calendar.startOfToday).toBe(true);
    expect(timeline.calibrations.completed.dueAt < calendar.startOfToday).toBe(true);
    expect(timeline.calibrations.archived.dueAt < timeline.calibrations.completed.dueAt).toBe(true);

    for (const calibration of [
      timeline.calibrations.active,
      timeline.calibrations.completed,
      timeline.calibrations.archived
    ]) {
      expect(calibration).toEqual(
        expect.objectContaining({
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
          participants: expect.any(Array),
          itemCreatedAt: expect.any(Array)
        })
      );
      expect(calibration.createdAt <= calibration.updatedAt).toBe(true);
      expect(calibration.updatedAt <= calendar.now).toBe(true);
      expect(calibration.reviewFinalizedAt.every((value) => value <= calibration.dueAt)).toBe(true);
      expect(
        calibration.participants.every(
          (participant) =>
            participant.createdAt <= participant.updatedAt &&
            participant.updatedAt <= calendar.now &&
            (!participant.completedAt || participant.completedAt <= calibration.dueAt)
        )
      ).toBe(true);
      expect(calibration.itemCreatedAt.every((value) => calibration.createdAt <= value && value <= calendar.now)).toBe(true);
    }
  });

  it("keeps integration runs, jobs, tokens, and recent activity chronological", () => {
    for (const run of Object.values(timeline.integrationRuns)) {
      expect(run.startedAt <= (run.finishedAt ?? calendar.now)).toBe(true);
      expect((run.finishedAt ?? run.startedAt) <= calendar.now).toBe(true);
    }

    for (const job of Object.values(timeline.backendJobs)) {
      expect(job.createdAt <= job.runAfter).toBe(true);
      if (job.startedAt) {
        expect(job.runAfter <= job.startedAt).toBe(true);
      }
      if (job.finishedAt) {
        expect(job.startedAt).toBeDefined();
        expect(job.startedAt! <= job.finishedAt).toBe(true);
        expect(job.finishedAt <= calendar.now).toBe(true);
      }
      expect(job.eventCreatedAt <= job.updatedAt).toBe(true);
      expect(job.updatedAt <= calendar.now).toBe(true);
    }
    expect(timeline.backendJobs.queued.runAfter > calendar.now).toBe(true);

    for (const token of Object.values(timeline.authSessions)) {
      expect(token.createdAt <= token.lastSeenAt).toBe(true);
      expect(token.lastSeenAt <= ("revokedAt" in token ? token.revokedAt : token.expiresAt)).toBe(true);
    }

    expect(timeline.recentActivity.every((value) => value >= calendar.rollingSevenDaysStart)).toBe(true);
    expect(timeline.recentActivity.every((value) => value <= calendar.now)).toBe(true);
  });
});

describe.each([
  ["midnight", "2026-07-27T00:00:00.000Z"],
  ["early morning", "2026-07-27T03:15:00.000Z"]
])("operational timeline at %s UTC", (_label, nowIso) => {
  const anchorCalendar = createDemoCalendar(new Date(nowIso));
  const anchorTimeline = buildDemoOperationalTimeline(anchorCalendar);

  it("never places observed activity after the exact anchor", () => {
    const observedDates = [
      ...Object.values(anchorTimeline.training).flatMap((items) =>
        items.flatMap((item) => [item.createdAt, item.updatedAt])
      ),
      ...Object.values(anchorTimeline.calibrations).flatMap((calibration) => [
        calibration.createdAt,
        calibration.updatedAt,
        ...calibration.reviewFinalizedAt,
        ...calibration.participants.flatMap((participant) => [
          participant.createdAt,
          participant.updatedAt,
          participant.completedAt
        ]),
        ...calibration.itemCreatedAt
      ]),
      ...Object.values(anchorTimeline.integrationRuns).flatMap((run) => [
        run.startedAt,
        run.finishedAt
      ]),
      ...Object.values(anchorTimeline.backendJobs).flatMap((job) => [
        job.createdAt,
        job.startedAt,
        job.finishedAt,
        job.eventCreatedAt,
        job.updatedAt
      ]),
      ...Object.values(anchorTimeline.reportSnapshots).flatMap((snapshot) => [
        snapshot.createdAt,
        snapshot.updatedAt
      ]),
      ...Object.values(anchorTimeline.authSessions).flatMap((session) => [
        session.createdAt,
        session.lastSeenAt,
        "revokedAt" in session ? session.revokedAt : null
      ]),
      ...Object.values(anchorTimeline.messaging.channels).flatMap((channel) => [
        channel.createdAt,
        channel.updatedAt,
        channel.lastDeliveredAt
      ]),
      ...Object.values(anchorTimeline.messaging.deliveries).flatMap((delivery) => [
        delivery.createdAt,
        delivery.deliveredAt
      ]),
      ...anchorTimeline.recentActivity
    ].filter((value): value is Date => value instanceof Date);

    expect(observedDates.every((value) => value <= anchorCalendar.now)).toBe(true);
  });

  it("keeps job chronology valid while only queued work is scheduled in the future", () => {
    for (const [name, job] of Object.entries(anchorTimeline.backendJobs)) {
      expect(job.createdAt <= job.runAfter).toBe(true);
      if (job.startedAt) {
        expect(job.runAfter <= job.startedAt).toBe(true);
      }
      if (job.finishedAt) {
        expect(job.startedAt).toBeInstanceOf(Date);
        expect(job.startedAt! <= job.finishedAt).toBe(true);
      }

      if (name === "queued") {
        expect(job.runAfter > anchorCalendar.now).toBe(true);
      } else {
        expect(job.runAfter <= anchorCalendar.now).toBe(true);
      }
    }
  });
});
