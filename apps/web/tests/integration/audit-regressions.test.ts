import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { reserveIdempotencyKey } from "@/lib/api/idempotency";
import { upsertCustomConversation } from "@/lib/conversation-import";
import { enqueueDueReportSchedules } from "@/lib/report-schedule";
import { loadReportPeriodKpis } from "@/lib/reports/report-period-kpis";
import { loadFinalizedReviews } from "@/lib/reports/report-page-data";
import { loadReportExportRows } from "@/lib/report-export";
import { buildReportCatalogSlug } from "@/lib/reports/report-filter-slug";
import { isCalibrationSessionReview, loadCalibrationReviewSession } from "@/lib/calibration/review-session";
import { customConversationSchema } from "@/lib/validation/custom-api";
import { isLocalPlaywrightVerifyDatabase } from "@/lib/local-playwright-verify-database";
import { assertReviewRubricStable } from "@/lib/review/rubric-guard";

const workspaceId = "audit-regression-workspace";
const userId = "audit-regression-reviewer";
const scorecardId = "audit-regression-scorecard";
const conversationId = "audit-regression-conversation";
const period = { preset: "custom", label: "Audit", start: new Date("2026-10-01T00:00:00Z"), end: new Date("2026-10-31T23:59:59.999Z") };

async function cleanup() {
  await prisma.backendJob.deleteMany({ where: { workspaceId } });
  await prisma.reportSchedule.deleteMany({ where: { workspaceId } });
  await prisma.idempotencyKey.deleteMany({ where: { workspaceId } });
  await prisma.review.deleteMany({ where: { workspaceId } });
  await prisma.calibrationSession.deleteMany({ where: { workspaceId } });
  await prisma.conversation.deleteMany({ where: { workspaceId } });
  await prisma.scorecardCriterion.deleteMany({ where: { scorecard: { workspaceId } } });
  await prisma.scorecard.deleteMany({ where: { workspaceId } });
  await prisma.user.deleteMany({ where: { workspaceId } });
  await prisma.workspace.deleteMany({ where: { id: workspaceId } });
}

describe.skipIf(!process.env.TEST_DATABASE_URL).sequential("audit regressions — real isolated Postgres", () => {
  beforeAll(async () => {
    if (!isLocalPlaywrightVerifyDatabase() || process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) {
      throw new Error("Audit tests require the same isolated local verify database in both URLs");
    }
    await cleanup();
    await prisma.workspace.create({ data: { id: workspaceId, name: "Audit fixtures" } });
    await prisma.user.create({ data: { id: userId, workspaceId, name: "Audit agent", email: "audit@example.invalid", role: "QA_ANALYST" } });
    await prisma.scorecard.create({ data: { id: scorecardId, workspaceId, name: "Audit rubric", version: 1 } });
    await prisma.conversation.create({ data: {
      id: conversationId, workspaceId, externalSource: "audit", externalId: "audit-case", channel: "CHAT",
      subject: "Audit case", status: "closed", tags: "", customerName: "Fixture", samplingReason: "Audit", openedAt: period.start
    } });
    for (const [reviewSource, totalScore] of [["HUMAN", 80], ["CALIBRATION", 20], ["SELF_REVIEW", 100]] as const) {
      await prisma.review.create({ data: { workspaceId, conversationId, reviewerId: userId, scorecardId,
        reviewSource, totalScore, rubricVersion: 1, status: "FINALIZED", summary: "Fixture", finalizedAt: period.start } });
    }
  });

  afterAll(async () => { if (isLocalPlaywrightVerifyDatabase()) await cleanup(); });

  it("counts only human production grades in both SQL KPIs and report rows", async () => {
    expect(await loadReportPeriodKpis(workspaceId, period)).toMatchObject({ finalizedCount: 1, averageScore: 80 });
    expect((await loadFinalizedReviews(workspaceId, period)).map((review) => review.totalScore)).toEqual([80]);
  });

  it("revokes the actual stored operator id when reimport omits the operator", async () => {
    const payload = customConversationSchema.parse({ externalSource: "audit", externalId: "imported-case", channel: "chat",
      subject: "Reassignment", status: "open", customerName: "Fixture", assigneeName: "Audit agent", samplingReason: "Audit", openedAt: period.start.toISOString() });
    const first = await upsertCustomConversation(workspaceId, payload, prisma, { samplingRules: [] });
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: first.id } })).assigneeId).toBe(userId);
    await upsertCustomConversation(workspaceId, { ...payload, assigneeName: undefined }, prisma, { samplingRules: [] });
    expect(await prisma.conversation.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({ assigneeId: null, assigneeName: null });
  });

  it("allows exactly one failed idempotency retry to own the write", async () => {
    const input = { workspaceId, key: "audit-retry", method: "POST", path: "/api/v1/conversations", requestHash: "audit-hash" };
    await prisma.idempotencyKey.create({ data: { ...input, status: "FAILED", expiresAt: new Date(Date.now() + 60_000) } });
    const results = await Promise.all([reserveIdempotencyKey(input), reserveIdempotencyKey(input)]);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(results.filter((result) => result.isInProgress)).toHaveLength(1);
  });

  it("rolls back the due slot on failed enqueue and can retry it exactly once", async () => {
    const now = new Date("2026-10-06T10:00:00Z");
    const schedule = await prisma.reportSchedule.create({ data: { workspaceId, name: "Audit weekly", nextRunAt: now } });
    const failingClient = {
      reportSchedule: prisma.reportSchedule,
      $transaction: async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => prisma.$transaction(async (tx) => callback({
        ...tx, backendJob: { ...tx.backendJob, create: async () => { throw new Error("Injected enqueue failure"); } }
      } as unknown as Prisma.TransactionClient))
    };
    await expect(enqueueDueReportSchedules(now, failingClient as never, workspaceId)).rejects.toThrow("Injected enqueue failure");
    expect(await prisma.reportSchedule.findUniqueOrThrow({ where: { id: schedule.id } })).toMatchObject({ nextRunAt: now, lastRunAt: null });
    expect(await prisma.backendJob.count({ where: { workspaceId } })).toBe(0);
    expect(await enqueueDueReportSchedules(now, prisma, workspaceId)).toEqual({ enqueuedCount: 1 });
    expect(await enqueueDueReportSchedules(now, prisma, workspaceId)).toEqual({ enqueuedCount: 0 });
    expect(await prisma.backendJob.count({ where: { workspaceId } })).toBe(1);
  });

  it("keeps grades of overlapping calibration sessions separate and enforces participant/rubric gates", async () => {
    const sessions = [];
    for (const name of ["First session", "Second session"]) {
      sessions.push(await prisma.calibrationSession.create({ data: { workspaceId, ownerId: userId, scorecardId, name, status: "active",
        participants: { create: { userId } }, items: { create: { conversationId } } } }));
    }
    const grade = await prisma.review.create({ data: { workspaceId, conversationId, reviewerId: userId, scorecardId,
      calibrationSessionId: sessions[0].id, reviewSource: "CALIBRATION", status: "FINALIZED", totalScore: 70, rubricVersion: 1, summary: "First grade", finalizedAt: period.start } });
    expect(isCalibrationSessionReview(grade, sessions[0].id, scorecardId)).toBe(true);
    expect(isCalibrationSessionReview(grade, sessions[1].id, scorecardId)).toBe(false);
    const context = { sessionId: sessions[1].id, workspaceId, conversationId, reviewerId: userId, scorecardId, activeOnly: true };
    expect(await loadCalibrationReviewSession(context, prisma)).toMatchObject({ scorecard: { id: scorecardId } });
    expect(await loadCalibrationReviewSession({ ...context, reviewerId: "outsider" }, prisma)).toBeNull();
    expect(await loadCalibrationReviewSession({ ...context, scorecardId: "wrong-rubric" }, prisma)).toBeNull();
    await prisma.calibrationSession.update({ where: { id: sessions[1].id }, data: { status: "completed" } });
    expect(await loadCalibrationReviewSession(context, prisma)).toBeNull();
  });

  it("exports matching risk evidence and preserves all-N/A block rows", async () => {
    const criterion = await prisma.scorecardCriterion.create({ data: {
      scorecardId, key: "solution", label: "Solution", block: "Решение", kind: "SCALE_1_3", weight: 100, order: 1
    } });
    const human = await prisma.review.findFirstOrThrow({ where: { workspaceId, reviewSource: "HUMAN" } });
    await prisma.criterionScore.create({ data: { reviewId: human.id, criterionId: criterion.id, value: 3, comment: "Fixture" } });
    const naReview = await prisma.review.create({ data: {
      workspaceId, conversationId, reviewerId: userId, scorecardId, reviewSource: "HUMAN", status: "FINALIZED",
      totalScore: 50, rubricVersion: 1, summary: "N/A block", finalizedAt: period.start,
      scores: { create: { criterionId: criterion.id, isNotApplicable: true, comment: "Fixture" } }
    } });
    for (const reviewId of [human.id, naReview.id]) {
      await prisma.finding.createMany({ data: [
        { reviewId, ownerType: "AGENT", category: "Low first", rootCause: "Fixture", evidenceSummary: "Fixture", riskLevel: "LOW", createdAt: period.start },
        { reviewId, ownerType: "AGENT", category: "High second", rootCause: "Fixture", evidenceSummary: "Fixture", riskLevel: "HIGH", createdAt: new Date(period.start.getTime() + 1000) }
      ] });
    }
    const result = await loadReportExportRows(workspaceId, { period: "custom", start: "2026-10-01", end: "2026-10-31", block: buildReportCatalogSlug("Решение"), risk: "high_plus" });
    expect(result.metrics).toMatchObject({ finalizedCount: 2, averageScore: 100, highRiskCount: 2 });
    expect(result.rows.map((row) => row[14])).toEqual(["HIGH", "HIGH"]);
    expect(result.rows.map((row) => row[1]).sort()).toEqual(["100 баллов", "Нет данных"].sort());
  });

  it("rejects a workbench whose criterion weights changed before the grade transaction", async () => {
    const expected = await prisma.scorecard.findUniqueOrThrow({ where: { id: scorecardId }, include: { criteria: { orderBy: { order: "asc" } } } });
    const criterion = expected.criteria[0];
    await prisma.scorecardCriterion.update({ where: { id: criterion.id }, data: { weight: 75 } });
    await expect(prisma.$transaction((tx) => assertReviewRubricStable(tx, workspaceId, expected))).rejects.toThrow("Форма оценки изменилась");
  });
});
