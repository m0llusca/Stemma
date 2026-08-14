import { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  createPrismaDemoSeedSmokeReader,
  DemoSeedSmokeInvariantError,
  collectDemoSeedSmokeSummary,
  runDemoSeedSmokeCli,
  type DemoSeedSmokeReader
} from "../../prisma/demo-seed-smoke";
import { createDemoCalendar } from "../../prisma/demo-calendar";
import { buildDemoSavedReportViews } from "../../prisma/demo-review-seeds";

const anchor = new Date("2026-07-27T12:00:00.000Z");

function statusGroups(statuses: readonly string[]) {
  return statuses.map((status, index) => ({
    status,
    count: index + 1
  }));
}

function createHealthyReader(): DemoSeedSmokeReader {
  return {
    findWorkspace: vi.fn().mockResolvedValue({ id: "demo-workspace" }),
    loadFinalizedHumanReviews: vi.fn().mockResolvedValue([
      {
        finalizedAt: new Date("2026-06-26T10:00:00.000Z"),
        conversation: { externalId: "scenario-previous-vk" }
      },
      {
        finalizedAt: new Date("2026-07-15T10:00:00.000Z"),
        conversation: { externalId: "scenario-previous-seven-days" }
      },
      {
        finalizedAt: new Date("2026-07-23T10:00:00.000Z"),
        conversation: { externalId: "scenario-current-vk" }
      }
    ]),
    loadConversationCoverage: vi.fn().mockResolvedValue([
        {
          externalId: "queue-overdue",
          externalSource: "otrs_family",
          assigneeName: "Agent 1",
          teamName: "Team 1",
          qaStatus: "QUEUED",
          reviewDueAt: new Date("2026-07-26T10:00:00.000Z")
        },
        {
          externalId: "queue-today",
          externalSource: "zendesk",
          assigneeName: "Agent 2",
          teamName: "Team 2",
          qaStatus: "ASSIGNED",
          reviewDueAt: new Date("2026-07-27T15:00:00.000Z")
        },
        {
          externalId: "queue-soon",
          externalSource: "freshdesk",
          assigneeName: "Agent 3",
          teamName: "Team 3",
          qaStatus: "IN_PROGRESS",
          reviewDueAt: new Date("2026-07-29T09:00:00.000Z")
        },
        {
          externalId: "queue-in-time",
          externalSource: "salesforce",
          assigneeName: "Agent 4",
          teamName: "Team 1",
          qaStatus: "REOPENED",
          reviewDueAt: new Date("2026-07-30T09:00:00.000Z")
        },
        {
          externalId: "breadth-5",
          externalSource: "jira_service",
          assigneeName: "Agent 1",
          teamName: "Team 1",
          qaStatus: "FINALIZED",
          reviewDueAt: null
        },
        {
          externalId: "breadth-6",
          externalSource: "custom_api",
          assigneeName: "Agent 2",
          teamName: "Team 2",
          qaStatus: "FINALIZED",
          reviewDueAt: null
        }
    ]),
    loadFindingCoverage: vi.fn().mockResolvedValue(
      Array.from({ length: 8 }, (_, index) => ({
        category: `Category ${index + 1}`,
        riskLevel: (["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const)[index % 4]
      }))
    ),
    loadTrainingStatusCounts: vi
      .fn()
      .mockResolvedValue(statusGroups(["open", "in_progress", "done"])),
    loadCalibrationStatusCounts: vi
      .fn()
      .mockResolvedValue(statusGroups(["draft", "active", "completed", "archived"])),
    loadBackendJobStatusCounts: vi
      .fn()
      .mockResolvedValue(statusGroups(["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"])),
    loadReportSnapshotStatusCounts: vi
      .fn()
      .mockResolvedValue(statusGroups(["QUEUED", "READY", "FAILED"])),
    loadIntegrationRunStatusCounts: vi
      .fn()
      .mockResolvedValue(
        statusGroups(["dry_run_ok", "imported", "queued", "dry_run_queued", "retry_scheduled", "failed"])
      ),
    loadRecentIntegrationRunStatusCounts: vi
      .fn()
      .mockResolvedValue(
        statusGroups(["imported", "queued", "dry_run_queued", "retry_scheduled", "failed"])
      ),
    loadAnalyticalScenario: vi.fn().mockResolvedValue({
      humanFinalizedCount: 84,
      currentThirtyFiveDayCount: 42,
      previousThirtyFiveDayCount: 42,
      criterionCount: 16,
      criterionScoreCount: 1344,
      scoreDraftCount: 12,
      savedReportViews: buildDemoSavedReportViews(createDemoCalendar(anchor)).map(
        (view) => ({ ...view, userId: null })
      ),
      operatorCount: 12,
      teamCount: 3,
      sourceCount: 7,
      nullSentimentCount: 84,
      evidenceReviewIds: [
        "demo-review-c01",
        "demo-review-c02",
        "demo-review-c03",
        "demo-review-c04",
        "demo-review-c05",
        "demo-review-c06",
        "demo-review-c09",
        "demo-review-c10",
        "demo-review-c11",
        "demo-review-c12",
        "demo-review-c13",
        "demo-review-c14",
        "demo-review-c18",
        "demo-review-c21",
        "demo-review-c24",
        "demo-review-c25",
        "demo-review-c28",
        "demo-review-c31",
        "demo-review-c32",
        "demo-review-c37",
        "demo-review-c38"
      ]
    }),
    disconnect: vi.fn().mockResolvedValue(undefined)
  };
}

describe("collectDemoSeedSmokeSummary", () => {
  it("returns explicit period, queue, activity, status, breadth, and scenario coverage", async () => {
    const reader = createHealthyReader();

    const summary = await collectDemoSeedSmokeSummary(reader, {
      NODE_ENV: "test",
      DEMO_SEED_NOW: anchor.toISOString()
    });

    expect(summary).toMatchObject({
      workspaceId: "demo-workspace",
      anchor: "2026-07-27T12:00:00.000Z",
      currentVkFinalized: 1,
      previousVkFinalized: 2,
      currentRollingSevenDays: 1,
      previousRollingSevenDays: 1,
      queueStatuses: {
        QUEUED: 1,
        ASSIGNED: 1,
        IN_PROGRESS: 1,
        REOPENED: 1
      },
      slaBuckets: {
        overdue: 1,
        today: 1,
        soon: 1,
        "in-time": 1
      },
      trainingStatuses: {
        open: 1,
        in_progress: 2,
        done: 3
      },
      calibrationStatuses: {
        draft: 1,
        active: 2,
        completed: 3,
        archived: 4
      },
      backendJobStatuses: {
        QUEUED: 1,
        RUNNING: 2,
        SUCCEEDED: 3,
        FAILED: 4,
        CANCELLED: 5
      },
      reportSnapshotStatuses: {
        QUEUED: 1,
        READY: 2,
        FAILED: 3
      },
      integrationRunStatuses: {
        dry_run_ok: 1,
        imported: 2,
        queued: 3,
        dry_run_queued: 4,
        retry_scheduled: 5,
        failed: 6
      },
      riskLevels: {
        LOW: 2,
        MEDIUM: 2,
        HIGH: 2,
        CRITICAL: 2
      },
      recentIntegrationRuns: 15,
      chartPointDays: 3,
      sourceCount: 6,
      agentCount: 4,
      teamCount: 3,
      findingCategoryCount: 8,
      analytical: {
        humanFinalizedCount: 84,
        currentThirtyFiveDayCount: 42,
        previousThirtyFiveDayCount: 42,
        criterionCount: 16,
        criterionScoreCount: 1344,
        scoreDraftCount: 12,
        savedReportViewCount: 4,
        operatorCount: 12,
        teamCount: 3,
        sourceCount: 7,
        nullSentimentCount: 84,
        evidenceReviewCount: 21
      },
      scenarioIds: {
        currentVkFinalized: "scenario-current-vk",
        previousVkFinalized: "scenario-previous-vk",
        currentRollingSevenDays: "scenario-current-vk",
        previousRollingSevenDays: "scenario-previous-seven-days",
        queueStatuses: {
          QUEUED: "queue-overdue",
          ASSIGNED: "queue-today",
          IN_PROGRESS: "queue-soon",
          REOPENED: "queue-in-time"
        },
        slaBuckets: {
          overdue: "queue-overdue",
          today: "queue-today",
          soon: "queue-soon",
          "in-time": "queue-in-time"
        }
      }
    });
    expect(summary.periods).toEqual({
      currentVk: {
        start: "2026-07-21T21:00:00.000Z",
        end: "2026-08-21T20:59:59.999Z"
      },
      previousVk: {
        start: "2026-06-21T21:00:00.000Z",
        end: "2026-07-21T20:59:59.999Z"
      }
    });
  });

  it.each([
    {
      label: "current report period",
      mutate: (reader: DemoSeedSmokeReader) => {
        vi.mocked(reader.loadFinalizedHumanReviews).mockResolvedValue([]);
      },
      scenarioId: "reviews.current-vk",
      invariant: "current VK period"
    },
    {
      label: "queue status",
      mutate: (reader: DemoSeedSmokeReader) => {
        vi.mocked(reader.loadConversationCoverage).mockResolvedValue([
          {
            externalId: "queue-today",
            externalSource: "otrs_family",
            assigneeName: "Agent 1",
            teamName: "Team 1",
            qaStatus: "ASSIGNED",
            reviewDueAt: new Date("2026-07-27T15:00:00.000Z")
          }
        ]);
      },
      scenarioId: "queue.QUEUED",
      invariant: "QUEUED"
    },
    {
      label: "canonical saved report view",
      mutate: (reader: DemoSeedSmokeReader) => {
        const healthy = buildDemoSavedReportViews(createDemoCalendar(anchor)).map(
          (view) => ({ ...view, userId: null })
        );
        vi.mocked(reader.loadAnalyticalScenario).mockResolvedValue({
          humanFinalizedCount: 84,
          currentThirtyFiveDayCount: 42,
          previousThirtyFiveDayCount: 42,
          criterionCount: 16,
          criterionScoreCount: 1344,
          scoreDraftCount: 12,
          savedReportViews: healthy.map((view, index) =>
            index === 0 ? { ...view, href: "/reports?invalid=1" } : view
          ),
          operatorCount: 12,
          teamCount: 3,
          sourceCount: 7,
          nullSentimentCount: 84,
          evidenceReviewIds: [
            "demo-review-c01",
            "demo-review-c02",
            "demo-review-c03",
            "demo-review-c04",
            "demo-review-c05",
            "demo-review-c06",
            "demo-review-c09",
            "demo-review-c10",
            "demo-review-c11",
            "demo-review-c12",
            "demo-review-c13",
            "demo-review-c14",
            "demo-review-c18",
            "demo-review-c21",
            "demo-review-c24",
            "demo-review-c25",
            "demo-review-c28",
            "demo-review-c31",
            "demo-review-c32",
            "demo-review-c37",
            "demo-review-c38"
          ]
        });
      },
      scenarioId: "analytical.saved-views",
      invariant:
        "canonical serialized fixtures; first mismatch: demo-saved-report-high-plus: href:"
    }
  ])("names a missing $label in a typed readable error", async ({ mutate, scenarioId, invariant }) => {
    const reader = createHealthyReader();
    mutate(reader);

    await expect(
      collectDemoSeedSmokeSummary(reader, {
        NODE_ENV: "test",
        DEMO_SEED_NOW: anchor.toISOString()
      })
    ).rejects.toMatchObject({
      name: "DemoSeedSmokeInvariantError",
      scenarioId,
      message: expect.stringContaining(invariant)
    } satisfies Partial<DemoSeedSmokeInvariantError>);
  });
});

describe("runDemoSeedSmokeCli", () => {
  it("prints concise JSON and always disconnects after success", async () => {
    const reader = createHealthyReader();
    const stdout = vi.fn();

    const exitCode = await runDemoSeedSmokeCli({
      reader,
      env: { NODE_ENV: "test", DEMO_SEED_NOW: anchor.toISOString() },
      stdout,
      stderr: vi.fn()
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout.mock.calls[0][0])).toMatchObject({
      workspaceId: "demo-workspace",
      currentVkFinalized: 1
    });
    expect(reader.disconnect).toHaveBeenCalledOnce();
  });

  it("returns a non-zero code, reports the error, and disconnects after failure", async () => {
    const reader = createHealthyReader();
    vi.mocked(reader.findWorkspace).mockResolvedValue(null);
    const stderr = vi.fn();

    const exitCode = await runDemoSeedSmokeCli({
      reader,
      env: { NODE_ENV: "test", DEMO_SEED_NOW: anchor.toISOString() },
      stdout: vi.fn(),
      stderr
    });

    expect(exitCode).toBe(1);
    expect(stderr.mock.calls[0][0]).toContain("workspace.demo-workspace");
    expect(reader.disconnect).toHaveBeenCalledOnce();
  });
});

describe("createPrismaDemoSeedSmokeReader", () => {
  it("exposes only query-specific reads and disconnect without opening a database connection", async () => {
    const prisma = new PrismaClient();
    const reader = createPrismaDemoSeedSmokeReader(prisma);

    expect(Object.keys(reader).sort()).toEqual([
      "disconnect",
      "findWorkspace",
      "loadAnalyticalScenario",
      "loadBackendJobStatusCounts",
      "loadCalibrationStatusCounts",
      "loadConversationCoverage",
      "loadFinalizedHumanReviews",
      "loadFindingCoverage",
      "loadIntegrationRunStatusCounts",
      "loadRecentIntegrationRunStatusCounts",
      "loadReportSnapshotStatusCounts",
      "loadTrainingStatusCounts"
    ]);

    await reader.disconnect();
  });
});
