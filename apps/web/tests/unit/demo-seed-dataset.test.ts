import { describe, expect, it } from "vitest";
import { buildDemoOperationalStatusPlan, buildOperationalConversationSeeds } from "../../prisma/demo-operational-seeds";
import { buildTwoMonthReviewedConversationSeeds } from "../../prisma/demo-review-seeds";

const context = {
  analystId: "qa-1",
  teamLeadId: "lead-1",
  seniorAnalystId: "qa-2",
  supportAgentName: "Иван Петров",
  supportOlgaName: "Ольга Иванова",
  supportDenisName: "Денис Соколов",
  supportElenaName: "Елена Морозова"
};

function inRange(date: Date, start: string, end: string) {
  const timestamp = date.getTime();

  return timestamp >= new Date(start).getTime() && timestamp <= new Date(end).getTime();
}

describe("two-month demo review dataset", () => {
  const seeds = buildTwoMonthReviewedConversationSeeds(context);

  it("fills a convincing two-month review window without future finalized dates", () => {
    expect(seeds.length).toBeGreaterThanOrEqual(56);
    expect(seeds.every((seed) => inRange(seed.finalizedAt, "2026-04-01T00:00:00.000Z", "2026-05-26T23:59:59.999Z"))).toBe(true);

    const weekBuckets = new Set(
      seeds.map((seed) => Math.floor((seed.finalizedAt.getTime() - new Date("2026-04-01T00:00:00.000Z").getTime()) / (7 * 24 * 60 * 60 * 1000)))
    );

    expect(weekBuckets.size).toBeGreaterThanOrEqual(8);
    expect(seeds.filter((seed) => inRange(seed.finalizedAt, "2026-04-01T00:00:00.000Z", "2026-04-21T23:59:59.999Z"))).toHaveLength(10);
    expect(seeds.filter((seed) => inRange(seed.finalizedAt, "2026-04-22T00:00:00.000Z", "2026-05-21T23:59:59.999Z")).length).toBeGreaterThanOrEqual(24);
    expect(seeds.filter((seed) => inRange(seed.finalizedAt, "2026-05-22T00:00:00.000Z", "2026-05-26T23:59:59.999Z")).length).toBeGreaterThanOrEqual(20);
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
    expect(seeds.filter((seed) => seed.needsReanswer).length).toBeGreaterThanOrEqual(10);
    expect(seeds.filter((seed) => seed.appealStatus && seed.appealStatus !== "none").length).toBeGreaterThanOrEqual(6);
  });
});

describe("operational demo dataset", () => {
  const seeds = buildOperationalConversationSeeds({
    ...context,
    analystName: "Проверяющий",
    teamLeadName: "Руководитель контроля качества",
    seniorAnalystName: "Мария Кузнецова"
  });
  const statusPlan = buildDemoOperationalStatusPlan();

  it("adds open and in-flight review queue states instead of only finalized checks", () => {
    expect(seeds.length).toBeGreaterThanOrEqual(10);
    expect(new Set(seeds.map((seed) => seed.qaStatus))).toEqual(new Set(["QUEUED", "ASSIGNED", "IN_PROGRESS", "REOPENED"]));
    expect(new Set(seeds.map((seed) => seed.status))).toEqual(new Set(["open", "pending", "solved", "closed"]));
    expect(new Set(seeds.map((seed) => seed.channel)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(seeds.map((seed) => seed.assigneeName ?? "Не назначен")).size).toBeGreaterThanOrEqual(5);
    expect(new Set(seeds.map((seed) => seed.teamName)).size).toBeGreaterThanOrEqual(3);
    expect(seeds.filter((seed) => seed.reviewDueAt < new Date("2026-05-27T00:00:00.000Z")).length).toBeGreaterThanOrEqual(3);
    expect(seeds.some((seed) => seed.draftReview)).toBe(true);
    expect(seeds.some((seed) => seed.previousFinalizedReview)).toBe(true);
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
});
