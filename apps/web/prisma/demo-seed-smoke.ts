import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { createDemoCalendar, resolveDemoSeedNow, type DemoCalendar } from "./demo-calendar";
import { demoEntityIds } from "./demo-seed-bootstrap";
import {
  buildDemoSavedReportViews,
  demoAnalyticalExpectations,
  demoEvidenceReviewIds,
  type DemoSavedReportViewSeed
} from "./demo-review-seeds";

const queueStatusNames = ["QUEUED", "ASSIGNED", "IN_PROGRESS", "REOPENED"] as const;
const slaBucketNames = ["overdue", "today", "soon", "in-time"] as const;
const trainingStatusNames = ["open", "in_progress", "done"] as const;
const calibrationStatusNames = ["draft", "active", "completed", "archived"] as const;
const backendJobStatusNames = ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"] as const;
const reportSnapshotStatusNames = ["QUEUED", "READY", "FAILED"] as const;
const integrationRunStatusNames = [
  "dry_run_ok",
  "imported",
  "queued",
  "dry_run_queued",
  "retry_scheduled",
  "failed"
] as const;
const riskLevelNames = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

type QueueStatus = (typeof queueStatusNames)[number];
type SlaBucket = (typeof slaBucketNames)[number];
type TrainingStatus = (typeof trainingStatusNames)[number];
type CalibrationStatus = (typeof calibrationStatusNames)[number];
type BackendJobStatus = (typeof backendJobStatusNames)[number];
type ReportSnapshotStatus = (typeof reportSnapshotStatusNames)[number];
type IntegrationRunStatus = (typeof integrationRunStatusNames)[number];
type RiskLevel = (typeof riskLevelNames)[number];

type StatusCountRow = {
  status: string;
  count: number;
};

type ReviewSmokeRow = {
  finalizedAt: Date | null;
  conversation: { externalId: string };
};

type ConversationSmokeRow = {
  externalId: string;
  externalSource: string;
  assigneeName: string | null;
  teamName: string | null;
  qaStatus: string;
  reviewDueAt: Date | null;
};

type FindingSmokeRow = {
  category: string;
  riskLevel: string;
};

type AnalyticalScenarioSmokeData = {
  humanFinalizedCount: number;
  currentThirtyFiveDayCount: number;
  previousThirtyFiveDayCount: number;
  criterionCount: number;
  criterionScoreCount: number;
  scoreDraftCount: number;
  savedReportViews: Array<{
    id: string;
    name: string;
    href: string;
    scope: string;
    order: number;
    userId: string | null;
  }>;
  operatorCount: number;
  teamCount: number;
  sourceCount: number;
  nullSentimentCount: number;
  evidenceReviewIds: string[];
};

export type DemoSeedSmokeReader = {
  findWorkspace(workspaceId: string): Promise<{ id: string } | null>;
  loadFinalizedHumanReviews(input: {
    workspaceId: string;
    finalizedThrough: Date;
  }): Promise<ReviewSmokeRow[]>;
  loadConversationCoverage(workspaceId: string): Promise<ConversationSmokeRow[]>;
  loadFindingCoverage(workspaceId: string): Promise<FindingSmokeRow[]>;
  loadTrainingStatusCounts(workspaceId: string): Promise<StatusCountRow[]>;
  loadCalibrationStatusCounts(workspaceId: string): Promise<StatusCountRow[]>;
  loadBackendJobStatusCounts(workspaceId: string): Promise<StatusCountRow[]>;
  loadReportSnapshotStatusCounts(workspaceId: string): Promise<StatusCountRow[]>;
  loadIntegrationRunStatusCounts(workspaceId: string): Promise<StatusCountRow[]>;
  loadRecentIntegrationRunStatusCounts(input: {
    workspaceId: string;
    startedFrom: Date;
    startedThrough: Date;
  }): Promise<StatusCountRow[]>;
  loadAnalyticalScenario(input: {
    workspaceId: string;
    currentStart: Date;
    currentEnd: Date;
    previousStart: Date;
    previousEnd: Date;
  }): Promise<AnalyticalScenarioSmokeData>;
  disconnect(): Promise<void>;
};

export type DemoSeedSmokeSummary = {
  workspaceId: string;
  anchor: string;
  periods: {
    currentVk: { start: string; end: string };
    previousVk: { start: string; end: string };
  };
  currentVkFinalized: number;
  previousVkFinalized: number;
  currentRollingSevenDays: number;
  previousRollingSevenDays: number;
  queueStatuses: Record<QueueStatus, number>;
  slaBuckets: Record<SlaBucket, number>;
  trainingStatuses: Record<TrainingStatus, number>;
  calibrationStatuses: Record<CalibrationStatus, number>;
  backendJobStatuses: Record<BackendJobStatus, number>;
  reportSnapshotStatuses: Record<ReportSnapshotStatus, number>;
  integrationRunStatuses: Record<IntegrationRunStatus, number>;
  riskLevels: Record<RiskLevel, number>;
  recentIntegrationRuns: number;
  chartPointDays: number;
  sourceCount: number;
  agentCount: number;
  teamCount: number;
  findingCategoryCount: number;
  analytical: {
    humanFinalizedCount: number;
    currentThirtyFiveDayCount: number;
    previousThirtyFiveDayCount: number;
    criterionCount: number;
    criterionScoreCount: number;
    scoreDraftCount: number;
    savedReportViewCount: number;
    operatorCount: number;
    teamCount: number;
    sourceCount: number;
    nullSentimentCount: number;
    evidenceReviewCount: number;
  };
  scenarioIds: {
    currentVkFinalized: string;
    previousVkFinalized: string;
    currentRollingSevenDays: string;
    previousRollingSevenDays: string;
    queueStatuses: Record<QueueStatus, string>;
    slaBuckets: Record<SlaBucket, string>;
  };
};

export class DemoSeedSmokeInvariantError extends Error {
  constructor(
    readonly scenarioId: string,
    readonly invariant: string
  ) {
    super(`Demo seed smoke ${scenarioId}: ${invariant}`);
    this.name = "DemoSeedSmokeInvariantError";
  }
}

function recordOf<Key extends string, Value>(
  keys: readonly Key[],
  value: Value
): Record<Key, Value> {
  return Object.fromEntries(keys.map((key) => [key, value])) as Record<Key, Value>;
}

function statusCounts<Key extends string>(
  keys: readonly Key[],
  rows: readonly StatusCountRow[]
): Record<Key, number> {
  const counts = recordOf(keys, 0);

  for (const row of rows) {
    if (keys.includes(row.status as Key)) {
      counts[row.status as Key] = row.count;
    }
  }

  return counts;
}

function isWithin(value: Date, start: Date, end: Date) {
  const timestamp = value.getTime();
  return timestamp >= start.getTime() && timestamp <= end.getTime();
}

function classifySla(dueAt: Date, calendar: DemoCalendar): SlaBucket {
  const dayMs = 24 * 60 * 60 * 1000;
  const timestamp = dueAt.getTime();
  const today = calendar.startOfToday.getTime();

  if (timestamp < today) return "overdue";
  if (timestamp < today + dayMs) return "today";
  if (timestamp < today + 3 * dayMs) return "soon";
  return "in-time";
}

function requirePositive(scenarioId: string, label: string, count: number) {
  if (count <= 0) {
    throw new DemoSeedSmokeInvariantError(
      scenarioId,
      `${label} must contain at least one record; received ${count}`
    );
  }
}

function requireMinimum(scenarioId: string, label: string, count: number, minimum: number) {
  if (count < minimum) {
    throw new DemoSeedSmokeInvariantError(
      scenarioId,
      `${label} must contain at least ${minimum} distinct values; received ${count}`
    );
  }
}

function requireExact(scenarioId: string, label: string, count: number, expected: number) {
  if (count !== expected) {
    throw new DemoSeedSmokeInvariantError(
      scenarioId,
      `${label} must equal ${expected}; received ${count}`
    );
  }
}

type SavedReportViewSmokeRow = AnalyticalScenarioSmokeData["savedReportViews"][number];

function describeFirstSavedViewMismatch(
  actual: readonly SavedReportViewSmokeRow[],
  expected: ReadonlyArray<DemoSavedReportViewSeed & { userId: string | null }>
): string {
  if (actual.length !== expected.length) {
    return `count: expected ${expected.length}, received ${actual.length}`;
  }

  for (const expectedView of expected) {
    const actualView = actual.find((view) => view.id === expectedView.id);

    if (!actualView) {
      return `${expectedView.id}: missing from the persisted views`;
    }

    const differingFields = (Object.keys(expectedView) as Array<keyof typeof expectedView>)
      .filter((field) => actualView[field] !== expectedView[field])
      .map(
        (field) =>
          `${field}: expected ${JSON.stringify(expectedView[field])}, received ${JSON.stringify(actualView[field])}`
      );

    if (differingFields.length > 0) {
      return `${expectedView.id}: ${differingFields.join("; ")}`;
    }
  }

  return `order: expected ${expected.map((view) => view.id).join(", ")}, received ${actual.map((view) => view.id).join(", ")}`;
}

function validateSummary(summary: DemoSeedSmokeSummary) {
  requirePositive("reviews.current-vk", "current VK period", summary.currentVkFinalized);
  requirePositive("reviews.previous-vk", "previous VK period", summary.previousVkFinalized);
  requirePositive(
    "reviews.current-rolling-seven-days",
    "current rolling seven-day window",
    summary.currentRollingSevenDays
  );
  requirePositive(
    "reviews.previous-rolling-seven-days",
    "previous rolling seven-day window",
    summary.previousRollingSevenDays
  );

  for (const status of queueStatusNames) {
    requirePositive(`queue.${status}`, `${status} queue status`, summary.queueStatuses[status]);
  }
  for (const bucket of slaBucketNames) {
    requirePositive(`queue.sla.${bucket}`, `${bucket} SLA bucket`, summary.slaBuckets[bucket]);
  }
  for (const status of trainingStatusNames) {
    requirePositive(`training.${status}`, `${status} training status`, summary.trainingStatuses[status]);
  }
  for (const status of calibrationStatusNames) {
    requirePositive(
      `calibration.${status}`,
      `${status} calibration status`,
      summary.calibrationStatuses[status]
    );
  }
  for (const status of backendJobStatusNames) {
    requirePositive(
      `backend-job.${status}`,
      `${status} backend job status`,
      summary.backendJobStatuses[status]
    );
  }
  for (const status of reportSnapshotStatusNames) {
    requirePositive(
      `report-snapshot.${status}`,
      `${status} report snapshot status`,
      summary.reportSnapshotStatuses[status]
    );
  }
  for (const status of integrationRunStatusNames) {
    requirePositive(
      `integration-run.${status}`,
      `${status} integration run status`,
      summary.integrationRunStatuses[status]
    );
  }
  for (const riskLevel of riskLevelNames) {
    requirePositive(`risk.${riskLevel}`, `${riskLevel} risk level`, summary.riskLevels[riskLevel]);
  }

  requirePositive(
    "integration-run.recent",
    "recent integration run activity",
    summary.recentIntegrationRuns
  );
  requirePositive("reviews.chart-point-days", "chart point days", summary.chartPointDays);
  requireMinimum("reviews.sources", "sources", summary.sourceCount, 6);
  requireMinimum("reviews.agents", "agents", summary.agentCount, 4);
  requireMinimum("reviews.teams", "teams", summary.teamCount, 3);
  requireMinimum("reviews.finding-categories", "finding categories", summary.findingCategoryCount, 8);
  requireExact(
    "analytical.human-finalized",
    "HUMAN/FINALIZED reviews",
    summary.analytical.humanFinalizedCount,
    demoAnalyticalExpectations.reviewCount
  );
  requireExact(
    "analytical.current-35",
    "current rolling-35 reviews",
    summary.analytical.currentThirtyFiveDayCount,
    demoAnalyticalExpectations.windowReviewCount
  );
  requireExact(
    "analytical.previous-35",
    "previous rolling-35 reviews",
    summary.analytical.previousThirtyFiveDayCount,
    demoAnalyticalExpectations.windowReviewCount
  );
  requireExact(
    "analytical.criteria",
    "scorecard criteria",
    summary.analytical.criterionCount,
    demoAnalyticalExpectations.criterionCount
  );
  requireExact(
    "analytical.denominator",
    "criterion scores",
    summary.analytical.criterionScoreCount,
    demoAnalyticalExpectations.criterionScoreCount
  );
  requireExact(
    "analytical.ai-drafts",
    "AI score drafts",
    summary.analytical.scoreDraftCount,
    demoAnalyticalExpectations.aiDraftCount
  );
  requireExact(
    "analytical.saved-views",
    "saved report views",
    summary.analytical.savedReportViewCount,
    demoAnalyticalExpectations.savedReportViewCount
  );
  requireExact(
    "analytical.operators",
    "operators",
    summary.analytical.operatorCount,
    demoAnalyticalExpectations.operatorCount
  );
  requireExact(
    "analytical.teams",
    "teams",
    summary.analytical.teamCount,
    demoAnalyticalExpectations.teamCount
  );
  requireExact(
    "analytical.sources",
    "sources",
    summary.analytical.sourceCount,
    demoAnalyticalExpectations.sourceCount
  );
  requireExact(
    "analytical.empty-sentiment",
    "reviews with null sentiment",
    summary.analytical.nullSentimentCount,
    demoAnalyticalExpectations.reviewCount
  );
  requireExact(
    "analytical.evidence",
    "unique stable evidence reviews",
    summary.analytical.evidenceReviewCount,
    demoAnalyticalExpectations.evidenceReviewCount
  );
}

function firstReviewScenario(
  reviews: readonly ReviewSmokeRow[],
  predicate: (date: Date) => boolean
) {
  return reviews.find((row) => row.finalizedAt !== null && predicate(row.finalizedAt))
    ?.conversation.externalId ?? "";
}

export async function collectDemoSeedSmokeSummary(
  reader: DemoSeedSmokeReader,
  env: NodeJS.ProcessEnv
): Promise<DemoSeedSmokeSummary> {
  const now = resolveDemoSeedNow(env);
  const calendar = createDemoCalendar(now);
  const workspaceId = demoEntityIds.workspace;
  const workspace = await reader.findWorkspace(workspaceId);

  if (!workspace) {
    throw new DemoSeedSmokeInvariantError(
      `workspace.${workspaceId}`,
      "seeded workspace was not found"
    );
  }

  const [
    reviews,
    conversations,
    findings,
    trainingGroups,
    calibrationGroups,
    backendJobGroups,
    reportSnapshotGroups,
    integrationRunGroups,
    recentIntegrationRunGroups,
    analyticalScenario
  ] = await Promise.all([
    reader.loadFinalizedHumanReviews({
      workspaceId,
      finalizedThrough: calendar.now
    }),
    reader.loadConversationCoverage(workspaceId),
    reader.loadFindingCoverage(workspaceId),
    reader.loadTrainingStatusCounts(workspaceId),
    reader.loadCalibrationStatusCounts(workspaceId),
    reader.loadBackendJobStatusCounts(workspaceId),
    reader.loadReportSnapshotStatusCounts(workspaceId),
    reader.loadIntegrationRunStatusCounts(workspaceId),
    reader.loadRecentIntegrationRunStatusCounts({
      workspaceId,
      startedFrom: calendar.rollingSevenDaysStart,
      startedThrough: calendar.now
    }),
    reader.loadAnalyticalScenario({
      workspaceId,
      currentStart: calendar.rollingThirtyFiveDaysStart,
      currentEnd: calendar.now,
      previousStart: calendar.previousThirtyFiveDaysStart,
      previousEnd: calendar.previousThirtyFiveDaysEnd
    })
  ]);

  const finalizedReviews = reviews.filter(
    (row): row is ReviewSmokeRow & { finalizedAt: Date } => row.finalizedAt !== null
  );
  const expectedSavedViews = buildDemoSavedReportViews(calendar).map((view) => ({
    ...view,
    userId: null
  }));
  if (
    JSON.stringify(analyticalScenario.savedReportViews) !==
    JSON.stringify(expectedSavedViews)
  ) {
    throw new DemoSeedSmokeInvariantError(
      "analytical.saved-views",
      `saved report views must match the canonical serialized fixtures; first mismatch: ${describeFirstSavedViewMismatch(
        analyticalScenario.savedReportViews,
        expectedSavedViews
      )}`
    );
  }
  const currentVkReviews = finalizedReviews.filter((row) =>
    isWithin(row.finalizedAt, calendar.currentVkPeriod.start, calendar.currentVkPeriod.end)
  );
  const previousVkReviews = finalizedReviews.filter((row) =>
    isWithin(row.finalizedAt, calendar.previousVkPeriod.start, calendar.previousVkPeriod.end)
  );
  const currentRollingReviews = finalizedReviews.filter(
    (row) =>
      row.finalizedAt >= calendar.rollingSevenDaysStart && row.finalizedAt <= calendar.now
  );
  const previousRollingReviews = finalizedReviews.filter(
    (row) =>
      row.finalizedAt >= calendar.previousSevenDaysStart &&
      row.finalizedAt < calendar.rollingSevenDaysStart
  );

  const queueStatuses = recordOf(queueStatusNames, 0);
  const queueScenarioIds = recordOf(queueStatusNames, "");
  const slaBuckets = recordOf(slaBucketNames, 0);
  const slaScenarioIds = recordOf(slaBucketNames, "");

  for (const conversation of conversations) {
    if (!queueStatusNames.includes(conversation.qaStatus as QueueStatus)) continue;

    const status = conversation.qaStatus as QueueStatus;
    queueStatuses[status] += 1;
    queueScenarioIds[status] ||= conversation.externalId;

    if (conversation.reviewDueAt) {
      const bucket = classifySla(conversation.reviewDueAt, calendar);
      slaBuckets[bucket] += 1;
      slaScenarioIds[bucket] ||= conversation.externalId;
    }
  }

  const integrationRunStatuses = statusCounts(integrationRunStatusNames, integrationRunGroups);
  const riskLevels = recordOf(riskLevelNames, 0);
  for (const finding of findings) {
    if (riskLevelNames.includes(finding.riskLevel as RiskLevel)) {
      riskLevels[finding.riskLevel as RiskLevel] += 1;
    }
  }

  const summary: DemoSeedSmokeSummary = {
    workspaceId,
    anchor: calendar.now.toISOString(),
    periods: {
      currentVk: {
        start: calendar.currentVkPeriod.start.toISOString(),
        end: calendar.currentVkPeriod.end.toISOString()
      },
      previousVk: {
        start: calendar.previousVkPeriod.start.toISOString(),
        end: calendar.previousVkPeriod.end.toISOString()
      }
    },
    currentVkFinalized: currentVkReviews.length,
    previousVkFinalized: previousVkReviews.length,
    currentRollingSevenDays: currentRollingReviews.length,
    previousRollingSevenDays: previousRollingReviews.length,
    queueStatuses,
    slaBuckets,
    trainingStatuses: statusCounts(trainingStatusNames, trainingGroups),
    calibrationStatuses: statusCounts(calibrationStatusNames, calibrationGroups),
    backendJobStatuses: statusCounts(backendJobStatusNames, backendJobGroups),
    reportSnapshotStatuses: statusCounts(reportSnapshotStatusNames, reportSnapshotGroups),
    integrationRunStatuses,
    riskLevels,
    recentIntegrationRuns: recentIntegrationRunGroups.reduce(
      (total, row) => total + row.count,
      0
    ),
    chartPointDays: new Set(
      finalizedReviews.map((row) => row.finalizedAt.toISOString().slice(0, 10))
    ).size,
    sourceCount: new Set(conversations.map((row) => row.externalSource)).size,
    agentCount: new Set(
      conversations.flatMap((row) => (row.assigneeName ? [row.assigneeName] : []))
    ).size,
    teamCount: new Set(
      conversations.flatMap((row) => (row.teamName ? [row.teamName] : []))
    ).size,
    findingCategoryCount: new Set(findings.map((row) => row.category)).size,
    analytical: {
      humanFinalizedCount: analyticalScenario.humanFinalizedCount,
      currentThirtyFiveDayCount:
        analyticalScenario.currentThirtyFiveDayCount,
      previousThirtyFiveDayCount:
        analyticalScenario.previousThirtyFiveDayCount,
      criterionCount: analyticalScenario.criterionCount,
      criterionScoreCount: analyticalScenario.criterionScoreCount,
      scoreDraftCount: analyticalScenario.scoreDraftCount,
      savedReportViewCount: analyticalScenario.savedReportViews.length,
      operatorCount: analyticalScenario.operatorCount,
      teamCount: analyticalScenario.teamCount,
      sourceCount: analyticalScenario.sourceCount,
      nullSentimentCount: analyticalScenario.nullSentimentCount,
      evidenceReviewCount: new Set(analyticalScenario.evidenceReviewIds).size
    },
    scenarioIds: {
      currentVkFinalized: firstReviewScenario(reviews, (date) =>
        isWithin(date, calendar.currentVkPeriod.start, calendar.currentVkPeriod.end)
      ),
      previousVkFinalized: firstReviewScenario(reviews, (date) =>
        isWithin(date, calendar.previousVkPeriod.start, calendar.previousVkPeriod.end)
      ),
      currentRollingSevenDays: firstReviewScenario(
        reviews,
        (date) => date >= calendar.rollingSevenDaysStart && date <= calendar.now
      ),
      previousRollingSevenDays: firstReviewScenario(
        reviews,
        (date) =>
          date >= calendar.previousSevenDaysStart && date < calendar.rollingSevenDaysStart
      ),
      queueStatuses: queueScenarioIds,
      slaBuckets: slaScenarioIds
    }
  };

  validateSummary(summary);
  return summary;
}

export type DemoSeedSmokeCliOptions = {
  reader: DemoSeedSmokeReader;
  env: NodeJS.ProcessEnv;
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
};

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function runDemoSeedSmokeCli({
  reader,
  env,
  stdout = console.log,
  stderr = console.error
}: DemoSeedSmokeCliOptions): Promise<number> {
  let exitCode = 0;

  try {
    const summary = await collectDemoSeedSmokeSummary(reader, env);
    stdout(JSON.stringify(summary));
  } catch (error) {
    stderr(formatError(error));
    exitCode = 1;
  } finally {
    try {
      await reader.disconnect();
    } catch (error) {
      stderr(`Failed to disconnect Prisma: ${formatError(error)}`);
      exitCode = 1;
    }
  }

  return exitCode;
}

export function createPrismaDemoSeedSmokeReader(
  prisma: PrismaClient
): DemoSeedSmokeReader {
  return {
    findWorkspace: (workspaceId) =>
      prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true }
      }),
    loadFinalizedHumanReviews: ({ workspaceId, finalizedThrough }) =>
      prisma.review.findMany({
        where: {
          workspaceId,
          reviewSource: "HUMAN",
          status: "FINALIZED",
          finalizedAt: { not: null, lte: finalizedThrough }
        },
        select: {
          finalizedAt: true,
          conversation: { select: { externalId: true } }
        },
        orderBy: [{ finalizedAt: "asc" }, { id: "asc" }]
      }),
    loadConversationCoverage: (workspaceId) =>
      prisma.conversation.findMany({
        where: { workspaceId },
        select: {
          externalId: true,
          externalSource: true,
          assigneeName: true,
          teamName: true,
          qaStatus: true,
          reviewDueAt: true
        },
        orderBy: { externalId: "asc" }
      }),
    loadFindingCoverage: (workspaceId) =>
      prisma.finding.findMany({
        where: { review: { workspaceId } },
        select: { category: true, riskLevel: true }
      }),
    loadTrainingStatusCounts: async (workspaceId) => {
      const groups = await prisma.trainingAssignment.groupBy({
        by: ["status"],
        where: { workspaceId },
        _count: { _all: true }
      });
      return groups.map((group) => ({
        status: group.status,
        count: group._count._all
      }));
    },
    loadCalibrationStatusCounts: async (workspaceId) => {
      const groups = await prisma.calibrationSession.groupBy({
        by: ["status"],
        where: { workspaceId },
        _count: { _all: true }
      });
      return groups.map((group) => ({
        status: group.status,
        count: group._count._all
      }));
    },
    loadBackendJobStatusCounts: async (workspaceId) => {
      const groups = await prisma.backendJob.groupBy({
        by: ["status"],
        where: { workspaceId },
        _count: { _all: true }
      });
      return groups.map((group) => ({
        status: group.status,
        count: group._count._all
      }));
    },
    loadReportSnapshotStatusCounts: async (workspaceId) => {
      const groups = await prisma.reportSnapshot.groupBy({
        by: ["status"],
        where: { workspaceId },
        _count: { _all: true }
      });
      return groups.map((group) => ({
        status: group.status,
        count: group._count._all
      }));
    },
    loadIntegrationRunStatusCounts: async (workspaceId) => {
      const groups = await prisma.integrationRun.groupBy({
        by: ["status"],
        where: { workspaceId },
        _count: { _all: true }
      });
      return groups.map((group) => ({
        status: group.status,
        count: group._count._all
      }));
    },
    loadRecentIntegrationRunStatusCounts: async ({
      workspaceId,
      startedFrom,
      startedThrough
    }) => {
      const groups = await prisma.integrationRun.groupBy({
        by: ["status"],
        where: {
          workspaceId,
          startedAt: {
            gte: startedFrom,
            lte: startedThrough
          }
        },
        _count: { _all: true }
      });
      return groups.map((group) => ({
        status: group.status,
        count: group._count._all
      }));
    },
    loadAnalyticalScenario: async ({
      workspaceId,
      currentStart,
      currentEnd,
      previousStart,
      previousEnd
    }) => {
      const evidenceReviewIds = [...demoEvidenceReviewIds];
      const [
        reviews,
        criterionCount,
        criterionScoreCount,
        scoreDraftCount,
        savedReportViews,
        operatorCount,
        persistedEvidence
      ] = await Promise.all([
        prisma.review.findMany({
          where: {
            workspaceId,
            reviewSource: "HUMAN",
            status: "FINALIZED"
          },
          select: {
            finalizedAt: true,
            conversation: {
              select: {
                externalSource: true,
                assigneeName: true,
                teamName: true,
                sentiment: true,
                sentimentScore: true,
                sentimentModel: true
              }
            }
          }
        }),
        prisma.scorecardCriterion.count({
          where: { scorecard: { workspaceId } }
        }),
        prisma.criterionScore.count({
          where: {
            review: {
              workspaceId,
              reviewSource: "HUMAN",
              status: "FINALIZED"
            }
          }
        }),
        prisma.aiQualityDraft.count({
          where: { workspaceId, kind: "score" }
        }),
        prisma.savedReportView.findMany({
          where: { workspaceId },
          select: {
            id: true,
            name: true,
            href: true,
            scope: true,
            order: true,
            userId: true
          },
          orderBy: { order: "asc" }
        }),
        prisma.user.count({
          where: { workspaceId, id: { startsWith: "demo-operator-" } }
        }),
        prisma.review.findMany({
          where: { workspaceId, id: { in: evidenceReviewIds } },
          select: { id: true }
        })
      ]);

      return {
        humanFinalizedCount: reviews.length,
        currentThirtyFiveDayCount: reviews.filter(
          (review) =>
            review.finalizedAt !== null &&
            review.finalizedAt >= currentStart &&
            review.finalizedAt <= currentEnd
        ).length,
        previousThirtyFiveDayCount: reviews.filter(
          (review) =>
            review.finalizedAt !== null &&
            review.finalizedAt >= previousStart &&
            review.finalizedAt <= previousEnd
        ).length,
        criterionCount,
        criterionScoreCount,
        scoreDraftCount,
        savedReportViews,
        operatorCount,
        teamCount: new Set(reviews.map((review) => review.conversation.teamName)).size,
        sourceCount: new Set(
          reviews.map((review) => review.conversation.externalSource)
        ).size,
        nullSentimentCount: reviews.filter(
          (review) =>
            review.conversation.sentiment === null &&
            review.conversation.sentimentScore === null &&
            review.conversation.sentimentModel === null
        ).length,
        evidenceReviewIds: persistedEvidence.map((review) => review.id)
      };
    },
    disconnect: () => prisma.$disconnect()
  };
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  const prisma = new PrismaClient();
  void runDemoSeedSmokeCli({
    reader: createPrismaDemoSeedSmokeReader(prisma),
    env: process.env
  }).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
