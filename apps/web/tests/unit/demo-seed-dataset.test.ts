import { describe, expect, it } from "vitest";
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
    expect(new Set(seeds.map((seed) => seed.reviewerId)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(seeds.map((seed) => seed.category)).size).toBeGreaterThanOrEqual(8);
    expect(new Set(seeds.map((seed) => seed.samplingType)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(seeds.map((seed) => seed.feedbackStatus)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(seeds.map((seed) => seed.riskLevel))).toEqual(new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]));
    expect(seeds.filter((seed) => seed.needsReanswer).length).toBeGreaterThanOrEqual(10);
    expect(seeds.filter((seed) => seed.appealStatus && seed.appealStatus !== "none").length).toBeGreaterThanOrEqual(6);
  });
});
