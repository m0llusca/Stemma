import { PrismaClient, type RoleName } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildReportEvidenceDescriptorCatalog,
  buildReportEvidenceKey,
  resolveReportEvidence,
  unavailableReportEvidence,
} from "@/lib/reports/report-evidence";
import { buildReportCatalogSlug } from "@/lib/reports/report-filter-slug";
import type {
  ReportAnalysisState,
  ReportFilterCatalog,
} from "@/lib/reports/report-analysis-state";

const workspaceId = "task7-evidence-workspace";
const foreignWorkspaceId = "task7-evidence-foreign-workspace";
const adminId = "task7-evidence-admin";
const viewerId = "task7-evidence-viewer";
const foreignAdminId = "task7-evidence-foreign-admin";
const scorecardId = "task7-evidence-scorecard";
const foreignScorecardId = "task7-evidence-foreign-scorecard";
const criterionId = "task7-evidence-criterion";
const otherCriterionId = "task7-evidence-other-criterion";
const foreignCriterionId = "task7-evidence-foreign-criterion";
const source = "freshdesk";
const team = "Task 7 команда";
const removedTeam = "Task 7 удалённая команда";
const block = "Процессы";
const operatorA = "Task 7 оператор A";
const operatorB = "Task 7 оператор B";
const currentConversationIds = Array.from(
  { length: 7 },
  (_, index) => `task7-evidence-conversation-${index + 1}`,
);
const excludedConversationIds = [
  "task7-evidence-conversation-draft",
  "task7-evidence-conversation-old",
  "task7-evidence-conversation-removed",
];
const foreignConversationId = "task7-evidence-foreign-conversation";
const currentReviewIds = [
  "task7-evidence-review-critical-a",
  "task7-evidence-review-critical-b",
  "task7-evidence-review-high-a",
  "task7-evidence-review-high-b",
  "task7-evidence-review-medium",
  "task7-evidence-review-low",
  "task7-evidence-review-low-na",
];
const excludedReviewIds = [
  "task7-evidence-review-draft",
  "task7-evidence-review-old",
  "task7-evidence-review-removed",
];
const foreignReviewId = "task7-evidence-foreign-review";
const aiDraftIds = [
  "task7-evidence-ai-real",
  "task7-evidence-ai-deterministic",
  "task7-evidence-ai-non-comparable",
];
const allWorkspaceReviewIds = [...currentReviewIds, ...excludedReviewIds];
const allWorkspaceConversationIds = [
  ...currentConversationIds,
  ...excludedConversationIds,
];

const catalog: ReportFilterCatalog = {
  teams: [
    { slug: buildReportCatalogSlug(team), value: team },
    { slug: buildReportCatalogSlug(removedTeam), value: removedTeam },
  ],
  sources: [source],
  blocks: [{ slug: buildReportCatalogSlug(block), value: block }],
};

const state: ReportAnalysisState = {
  view: "overview",
  period: "custom",
  start: "2026-07-01",
  end: "2026-07-31",
  compare: "previous",
  grain: "day",
  chartView: "graph",
  series: ["score", "volume", "previous", "target"],
  evidenceType: "kpi",
  evidenceKey: "",
};

function user(id: string, workspace: string, role: RoleName) {
  return {
    id,
    workspaceId: workspace,
    email: `${id}@example.invalid`,
    name: id,
    role,
  };
}

function requireDatabaseUrl() {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    throw new Error("TEST_DATABASE_URL is required for this integration test");
  }
  if (process.env.DATABASE_URL !== testUrl) {
    throw new Error("DATABASE_URL must exactly equal TEST_DATABASE_URL");
  }

  const parsed = new URL(testUrl);
  if (parsed.pathname !== "/qc_app_demo_verify") {
    throw new Error("Task 7 integration test requires qc_app_demo_verify");
  }
  return testUrl;
}

let database: PrismaClient | undefined;

async function removeFixtures(prisma: PrismaClient) {
  await prisma.$transaction([
    prisma.aiQualityDraft.deleteMany({
      where: { id: { in: aiDraftIds } },
    }),
    prisma.review.deleteMany({
      where: {
        id: { in: [...allWorkspaceReviewIds, foreignReviewId] },
      },
    }),
    prisma.conversation.deleteMany({
      where: {
        id: { in: [...allWorkspaceConversationIds, foreignConversationId] },
      },
    }),
    prisma.scorecardCriterion.deleteMany({
      where: {
        id: { in: [criterionId, otherCriterionId, foreignCriterionId] },
      },
    }),
    prisma.scorecard.deleteMany({
      where: { id: { in: [scorecardId, foreignScorecardId] } },
    }),
    prisma.user.deleteMany({
      where: { id: { in: [adminId, viewerId, foreignAdminId] } },
    }),
    prisma.workspace.deleteMany({
      where: { id: { in: [workspaceId, foreignWorkspaceId] } },
    }),
  ]);
}

async function createReview(
  prisma: PrismaClient,
  input: {
    id: string;
    conversationId: string;
    workspace: string;
    reviewerId: string;
    scorecard: string;
    status?: "DRAFT" | "FINALIZED";
    finalizedAt: string;
    totalScore: number;
    risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  },
) {
  await prisma.review.create({
    data: {
      id: input.id,
      workspaceId: input.workspace,
      conversationId: input.conversationId,
      reviewerId: input.reviewerId,
      scorecardId: input.scorecard,
      reviewSource: "HUMAN",
      rubricVersion: 1,
      status: input.status ?? "FINALIZED",
      totalScore: input.totalScore,
      summary: `PII summary for ${input.id}`,
      feedbackComment: `PII feedback for ${input.id}`,
      finalizedAt: new Date(input.finalizedAt),
      findings: {
        create: {
          ownerType: "PROCESS",
          category: "Task 7 category",
          rootCause: "Task 7 root cause",
          riskLevel: input.risk,
          evidenceSummary: `PII evidence for ${input.id}`,
        },
      },
      scores: {
        create: {
          id: `${input.id}-criterion-score`,
          criterionId:
            input.workspace === workspaceId ? criterionId : foreignCriterionId,
          value: 2,
          comment: `PII score comment for ${input.id}`,
        },
      },
    },
  });
}

describe
  .skipIf(!process.env.TEST_DATABASE_URL)
  .sequential("report evidence resolver — isolated real database", () => {
    beforeAll(async () => {
      const databaseUrl = requireDatabaseUrl();
      database = new PrismaClient({
        datasources: { db: { url: databaseUrl } },
      });
      const [identity] = await database.$queryRaw<
        Array<{ database: string; schema: string }>
      >`SELECT current_database() AS database, current_schema() AS schema`;
      expect(identity).toEqual({
        database: "qc_app_demo_verify",
        schema: "public",
      });

      await removeFixtures(database);
      await database.workspace.createMany({
        data: [
          { id: workspaceId, name: "Task 7 evidence workspace" },
          { id: foreignWorkspaceId, name: "Task 7 foreign workspace" },
        ],
      });
      await database.user.createMany({
        data: [
          {
            id: adminId,
            workspaceId,
            email: "task7-admin@example.invalid",
            name: "Task 7 admin",
            role: "ADMIN",
          },
          {
            id: viewerId,
            workspaceId,
            email: "task7-viewer@example.invalid",
            name: "Task 7 viewer",
            role: "VIEWER",
          },
          {
            id: foreignAdminId,
            workspaceId: foreignWorkspaceId,
            email: "task7-foreign@example.invalid",
            name: "Task 7 foreign admin",
            role: "ADMIN",
          },
        ],
      });
      await database.scorecard.createMany({
        data: [
          {
            id: scorecardId,
            workspaceId,
            name: "Task 7 scorecard",
            version: 1,
          },
          {
            id: foreignScorecardId,
            workspaceId: foreignWorkspaceId,
            name: "Task 7 foreign scorecard",
            version: 1,
          },
        ],
      });
      await database.scorecardCriterion.createMany({
        data: [
          {
            id: criterionId,
            scorecardId,
            key: "task7-process",
            label: "Task 7 process",
            block,
            kind: "SCALE_1_3",
            weight: 100,
            order: 1,
          },
          {
            id: foreignCriterionId,
            scorecardId: foreignScorecardId,
            key: "task7-process",
            label: "Task 7 process",
            block,
            kind: "SCALE_1_3",
            weight: 100,
            order: 1,
          },
          {
            id: otherCriterionId,
            scorecardId,
            key: "task7-sales",
            label: "Task 7 sales",
            block: "Продажи",
            kind: "SCALE_1_3",
            weight: 100,
            order: 2,
          },
        ],
      });

      const conversationRows = allWorkspaceConversationIds.map((id, index) => ({
        id,
        workspaceId,
        externalSource: source,
        externalId: id,
        channel: "TICKET" as const,
        subject: `PII subject ${index}`,
        status: "closed",
        tags: "task7",
        customerName: `PII customer ${index}`,
        teamName: id.endsWith("removed") ? removedTeam : team,
        assigneeName: index < 2 ? operatorA : operatorB,
        samplingReason: "Task 7 fixture",
        openedAt: new Date("2026-07-01T08:00:00.000Z"),
      }));
      await database.conversation.createMany({
        data: [
          ...conversationRows,
          {
            id: foreignConversationId,
            workspaceId: foreignWorkspaceId,
            externalSource: source,
            externalId: foreignConversationId,
            channel: "TICKET",
            subject: "PII foreign subject",
            status: "closed",
            tags: "task7",
            customerName: "PII foreign customer",
            teamName: team,
            assigneeName: operatorA,
            samplingReason: "Task 7 foreign fixture",
            openedAt: new Date("2026-07-01T08:00:00.000Z"),
          },
        ],
      });

      const eligible = [
        [
          "task7-evidence-review-critical-a",
          currentConversationIds[0],
          "CRITICAL",
          "2026-07-20T12:00:00.000Z",
          61,
        ],
        [
          "task7-evidence-review-critical-b",
          currentConversationIds[1],
          "CRITICAL",
          "2026-07-20T12:00:00.000Z",
          62,
        ],
        [
          "task7-evidence-review-high-a",
          currentConversationIds[2],
          "HIGH",
          "2026-07-26T12:00:00.000Z",
          71,
        ],
        [
          "task7-evidence-review-high-b",
          currentConversationIds[3],
          "HIGH",
          "2026-07-25T12:00:00.000Z",
          72,
        ],
        [
          "task7-evidence-review-medium",
          currentConversationIds[4],
          "MEDIUM",
          "2026-07-28T12:00:00.000Z",
          81,
        ],
        [
          "task7-evidence-review-low",
          currentConversationIds[5],
          "LOW",
          "2026-07-30T12:00:00.000Z",
          91,
        ],
        [
          "task7-evidence-review-low-na",
          currentConversationIds[6],
          "LOW",
          "2026-07-31T10:00:00.000Z",
          88,
        ],
      ] as const;
      for (const [
        id,
        conversationId,
        risk,
        finalizedAt,
        totalScore,
      ] of eligible) {
        await createReview(database, {
          id,
          conversationId,
          workspace: workspaceId,
          reviewerId: adminId,
          scorecard: scorecardId,
          finalizedAt,
          totalScore,
          risk,
        });
      }
      await database.criterionScore.create({
        data: {
          id: "task7-evidence-review-low-other-score",
          reviewId: "task7-evidence-review-low",
          criterionId: otherCriterionId,
          value: 1,
          comment: "PII other block score",
        },
      });
      await database.criterionScore.update({
        where: {
          reviewId_criterionId: {
            reviewId: "task7-evidence-review-low-na",
            criterionId,
          },
        },
        data: {
          value: null,
          isNotApplicable: true,
        },
      });
      await database.criterionScore.create({
        data: {
          id: "task7-evidence-review-low-na-other-score",
          reviewId: "task7-evidence-review-low-na",
          criterionId: otherCriterionId,
          value: 3,
          comment: "PII comparable other block score",
        },
      });
      await database.aiQualityDraft.createMany({
        data: [
          {
            id: aiDraftIds[0],
            workspaceId,
            conversationId: currentConversationIds[5],
            reviewId: "task7-evidence-review-low",
            kind: "score",
            modelVersion: "yandexgpt-task7",
            promptVersion: "task7",
            confidence: 0.41,
            suggestedValueJson: JSON.stringify({
              criteria: [{ criterionId, value: 2 }],
            }),
            createdAt: new Date("2026-07-22T09:00:00.000Z"),
          },
          {
            id: aiDraftIds[1],
            workspaceId,
            conversationId: currentConversationIds[4],
            reviewId: "task7-evidence-review-medium",
            kind: "score",
            modelVersion: "deterministic-task7",
            promptVersion: "task7",
            confidence: 0.9,
            suggestedValueJson: JSON.stringify({
              criteria: [{ criterionId, value: 2 }],
            }),
            createdAt: new Date("2026-07-23T09:00:00.000Z"),
          },
          {
            id: aiDraftIds[2],
            workspaceId,
            conversationId: currentConversationIds[6],
            reviewId: "task7-evidence-review-low-na",
            kind: "score",
            modelVersion: "yandexgpt-task7",
            promptVersion: "task7",
            confidence: 0.7,
            suggestedValueJson: JSON.stringify({
              criteria: [{ criterionId: otherCriterionId, value: 3 }],
            }),
            createdAt: new Date("2026-07-29T09:00:00.000Z"),
          },
        ],
      });
      await createReview(database, {
        id: excludedReviewIds[0],
        conversationId: excludedConversationIds[0],
        workspace: workspaceId,
        reviewerId: adminId,
        scorecard: scorecardId,
        status: "DRAFT",
        finalizedAt: "2026-07-29T12:00:00.000Z",
        totalScore: 99,
        risk: "CRITICAL",
      });
      await createReview(database, {
        id: excludedReviewIds[1],
        conversationId: excludedConversationIds[1],
        workspace: workspaceId,
        reviewerId: adminId,
        scorecard: scorecardId,
        finalizedAt: "2026-06-29T12:00:00.000Z",
        totalScore: 98,
        risk: "CRITICAL",
      });
      await createReview(database, {
        id: excludedReviewIds[2],
        conversationId: excludedConversationIds[2],
        workspace: workspaceId,
        reviewerId: adminId,
        scorecard: scorecardId,
        status: "DRAFT",
        finalizedAt: "2026-07-27T12:00:00.000Z",
        totalScore: 97,
        risk: "CRITICAL",
      });
      await createReview(database, {
        id: foreignReviewId,
        conversationId: foreignConversationId,
        workspace: foreignWorkspaceId,
        reviewerId: foreignAdminId,
        scorecard: foreignScorecardId,
        finalizedAt: "2026-07-31T12:00:00.000Z",
        totalScore: 100,
        risk: "CRITICAL",
      });
    }, 30_000);

    afterAll(async () => {
      if (database) {
        await removeFixtures(database);
        await database.$disconnect();
      }
    });

    it("returns only five PII-minimized rows ranked by risk, finalized time, then stable id", async () => {
      const [descriptor] = buildReportEvidenceDescriptorCatalog({
        workspaceId,
        state,
        catalog,
        selection: { evidenceType: "kpi", metric: "quality-score" },
      });
      expect(descriptor).toBeDefined();
      const evidenceState = {
        ...state,
        evidenceType: "kpi" as const,
        evidenceKey: descriptor.key,
      };

      const result = await resolveReportEvidence(
        {
          user: user(adminId, workspaceId, "ADMIN"),
          state: evidenceState,
        },
        { database: database! },
      );

      expect(result.status).toBe("ready");
      if (result.status !== "ready") return;
      expect(result.rows).toHaveLength(5);
      expect(result.rows.map((row) => row.id)).toEqual([
        "task7-evidence-review-critical-a",
        "task7-evidence-review-critical-b",
        "task7-evidence-review-high-a",
        "task7-evidence-review-high-b",
        "task7-evidence-review-medium",
      ]);
      expect(result.rows[0]).toEqual({
        id: "task7-evidence-review-critical-a",
        conversationId: currentConversationIds[0],
        href: expect.stringMatching(
          /^\/reviews\/task7-evidence-conversation-1\?returnTo=%2Freports%3F/,
        ),
        scoreLabel: "61 балл",
        finalizedAt: "2026-07-20T12:00:00.000Z",
        sourceLabel: "Freshdesk",
        teamLabel: team,
        riskLabel: "Критический риск",
        relationLabel: "Связано с выбранной выборкой",
      });
      const serialized = JSON.stringify(result);
      expect(serialized).not.toMatch(
        /customer|subject|summary|feedback|rootCause|message|@example/i,
      );
      expect(serialized).not.toContain("PII ");
      expect(serialized).not.toContain(foreignConversationId);
      expect(serialized).not.toContain(excludedConversationIds[0]);
      expect(serialized).not.toContain(excludedConversationIds[1]);
    });

    it("labels previous, year-over-year, and disabled comparison modes truthfully", async () => {
      const expected = {
        previous: "Сравнение с прошлым периодом",
        year: "Сравнение с периодом год назад",
        none: "Без сравнительного периода",
      } as const;

      for (const compare of ["previous", "year", "none"] as const) {
        const comparisonState = { ...state, compare };
        const [descriptor] = buildReportEvidenceDescriptorCatalog({
          workspaceId,
          state: comparisonState,
          catalog,
          selection: { evidenceType: "kpi", metric: "quality-score" },
        });
        const result = await resolveReportEvidence(
          {
            user: user(adminId, workspaceId, "ADMIN"),
            state: {
              ...comparisonState,
              evidenceType: "kpi",
              evidenceKey: descriptor.key,
            },
          },
          { database: database! },
        );

        expect(result.status).toBe("ready");
        expect(result.status === "ready" ? result.comparison : "").toBe(
          expected[compare],
        );
      }
    });

    it("distinguishes exact trend and reason-trend buckets without widening to the period", async () => {
      const [qualityDay] = buildReportEvidenceDescriptorCatalog({
        workspaceId,
        state,
        catalog,
        selection: {
          evidenceType: "trend",
          metric: "quality-score",
          bucketStart: "2026-07-20",
        },
      });
      const [otherQualityDay] = buildReportEvidenceDescriptorCatalog({
        workspaceId,
        state,
        catalog,
        selection: {
          evidenceType: "trend",
          metric: "quality-score",
          bucketStart: "2026-07-25",
        },
      });
      const [reasonDay] = buildReportEvidenceDescriptorCatalog({
        workspaceId,
        state,
        catalog,
        reasons: ["Task 7 category"],
        selection: {
          evidenceType: "trend",
          metric: "reason-trend",
          facet: { reason: "Task 7 category" },
          bucketStart: "2026-07-25",
        },
      });
      const [otherReasonDay] = buildReportEvidenceDescriptorCatalog({
        workspaceId,
        state,
        catalog,
        reasons: ["Task 7 category"],
        selection: {
          evidenceType: "trend",
          metric: "reason-trend",
          facet: { reason: "Task 7 category" },
          bucketStart: "2026-07-26",
        },
      });
      const [firstAiWeek] = buildReportEvidenceDescriptorCatalog({
        workspaceId,
        state,
        catalog,
        selection: {
          evidenceType: "trend",
          metric: "ai-confidence",
          bucketStart: "2026-06-29",
        },
      });
      const [secondAiWeek] = buildReportEvidenceDescriptorCatalog({
        workspaceId,
        state,
        catalog,
        selection: {
          evidenceType: "trend",
          metric: "ai-confidence",
          bucketStart: "2026-07-06",
        },
      });

      expect(qualityDay.key).not.toBe(otherQualityDay.key);
      expect(reasonDay.key).not.toBe(otherReasonDay.key);
      expect(firstAiWeek.key).not.toBe(secondAiWeek.key);
      const qualityResult = await resolveReportEvidence(
        {
          user: user(adminId, workspaceId, "ADMIN"),
          state: {
            ...state,
            evidenceType: "trend",
            evidenceKey: qualityDay.key,
          },
        },
        { database: database! },
      );
      const reasonResult = await resolveReportEvidence(
        {
          user: user(adminId, workspaceId, "ADMIN"),
          state: {
            ...state,
            evidenceType: "trend",
            evidenceKey: reasonDay.key,
          },
        },
        { database: database! },
      );

      expect(qualityResult.status).toBe("ready");
      expect(
        qualityResult.status === "ready"
          ? qualityResult.rows.map((row) => row.id)
          : [],
      ).toEqual([
        "task7-evidence-review-critical-a",
        "task7-evidence-review-critical-b",
      ]);
      expect(reasonResult.status).toBe("ready");
      expect(
        reasonResult.status === "ready"
          ? reasonResult.rows.map((row) => row.id)
          : [],
      ).toEqual(["task7-evidence-review-high-b"]);
    });

    it("keeps the high-risk KPI descriptor scoped to HIGH and CRITICAL findings", async () => {
      const [descriptor] = buildReportEvidenceDescriptorCatalog({
        workspaceId,
        state,
        catalog,
        selection: {
          evidenceType: "kpi",
          metric: "high-risk",
        },
      });
      const result = await resolveReportEvidence(
        {
          user: user(adminId, workspaceId, "ADMIN"),
          state: {
            ...state,
            evidenceType: "kpi",
            evidenceKey: descriptor.key,
          },
        },
        { database: database! },
      );

      expect(result.status).toBe("ready");
      expect(
        result.status === "ready" ? result.rows.map((row) => row.id) : [],
      ).toEqual([
        "task7-evidence-review-critical-a",
        "task7-evidence-review-critical-b",
        "task7-evidence-review-high-a",
        "task7-evidence-review-high-b",
      ]);

      const intersections = [
        {
          risk: "high_plus" as const,
          expected: [
            "task7-evidence-review-critical-a",
            "task7-evidence-review-critical-b",
            "task7-evidence-review-high-a",
            "task7-evidence-review-high-b",
          ],
        },
        {
          risk: "high" as const,
          expected: [
            "task7-evidence-review-high-a",
            "task7-evidence-review-high-b",
          ],
        },
        {
          risk: "critical" as const,
          expected: [
            "task7-evidence-review-critical-a",
            "task7-evidence-review-critical-b",
          ],
        },
      ];
      for (const intersection of intersections) {
        const intersectionState: ReportAnalysisState = {
          ...state,
          risk: intersection.risk,
        };
        const [intersectionDescriptor] =
          buildReportEvidenceDescriptorCatalog({
            workspaceId,
            state: intersectionState,
            catalog,
            selection: {
              evidenceType: "kpi",
              metric: "high-risk",
            },
          });
        const intersectionResult = await resolveReportEvidence(
          {
            user: user(adminId, workspaceId, "ADMIN"),
            state: {
              ...intersectionState,
              evidenceType: "kpi",
              evidenceKey: intersectionDescriptor.key,
            },
          },
          { database: database! },
        );
        expect(
          intersectionResult.status === "ready"
            ? intersectionResult.rows.map((row) => row.id)
            : [],
        ).toEqual(intersection.expected);
      }

      for (const risk of ["low", "medium"] as const) {
        const incompatibleState: ReportAnalysisState = { ...state, risk };
        expect(
          buildReportEvidenceDescriptorCatalog({
            workspaceId,
            state: incompatibleState,
            catalog,
            selection: {
              evidenceType: "kpi",
              metric: "high-risk",
            },
          }),
        ).toEqual([]);
        expect(
          await resolveReportEvidence(
            {
              user: user(adminId, workspaceId, "ADMIN"),
              state: {
                ...incompatibleState,
                evidenceType: "kpi",
                evidenceKey: descriptor.key,
              },
            },
            { database: database! },
          ),
        ).toEqual(unavailableReportEvidence);
      }
    });

    it("keeps an exact risk facet finding-level for a mixed LOW and CRITICAL review", async () => {
      const mixedFinding = await database!.finding.create({
        data: {
          reviewId: "task7-evidence-review-low",
          ownerType: "PROCESS",
          category: "Task 7 mixed critical category",
          rootCause: "Task 7 mixed critical root cause",
          riskLevel: "CRITICAL",
          evidenceSummary: "PII mixed critical evidence",
        },
      });
      const lowRiskState: ReportAnalysisState = {
        ...state,
        risk: "low",
      };
      const [descriptor] = buildReportEvidenceDescriptorCatalog({
        workspaceId,
        state: lowRiskState,
        catalog,
        selection: {
          evidenceType: "kpi",
          metric: "quality-score",
        },
      });
      const result = await resolveReportEvidence(
        {
          user: user(adminId, workspaceId, "ADMIN"),
          state: {
            ...lowRiskState,
            evidenceType: "kpi",
            evidenceKey: descriptor.key,
          },
        },
        { database: database! },
      );
      const [wrongIntersectionDescriptor] =
        buildReportEvidenceDescriptorCatalog({
          workspaceId,
          state: lowRiskState,
          catalog,
          reasons: ["Task 7 mixed critical category"],
          selection: {
            evidenceType: "driver",
            metric: "reason",
            facet: { reason: "Task 7 mixed critical category" },
          },
        });
      const wrongIntersectionResult = await resolveReportEvidence(
        {
          user: user(adminId, workspaceId, "ADMIN"),
          state: {
            ...lowRiskState,
            evidenceType: "driver",
            evidenceKey: wrongIntersectionDescriptor.key,
          },
        },
        { database: database! },
      );
      await database!.finding.delete({ where: { id: mixedFinding.id } });

      expect(result.status).toBe("ready");
      expect(
        result.status === "ready"
          ? result.rows.find(
              (row) => row.id === "task7-evidence-review-low"
            )
          : undefined,
      ).toEqual(
        expect.objectContaining({
          riskLabel: "Низкий риск",
        }),
      );
      expect(
        result.status === "ready"
          ? result.rows.every((row) => row.riskLabel === "Низкий риск")
          : false,
      ).toBe(true);
      expect(JSON.stringify(result)).not.toContain("Критический риск");
      expect(wrongIntersectionResult).toEqual(unavailableReportEvidence);
    });

    it("uses only the selected block score for a mixed-block review", async () => {
      const blockRiskState: ReportAnalysisState = {
        ...state,
        block: buildReportCatalogSlug(block),
        risk: "low",
      };
      const [descriptor] = buildReportEvidenceDescriptorCatalog({
        workspaceId,
        state: blockRiskState,
        catalog,
        selection: {
          evidenceType: "kpi",
          metric: "quality-score",
        },
      });
      const result = await resolveReportEvidence(
        {
          user: user(adminId, workspaceId, "ADMIN"),
          state: {
            ...blockRiskState,
            evidenceType: "kpi",
            evidenceKey: descriptor.key,
          },
        },
        { database: database! },
      );

      expect(result.status).toBe("ready");
      expect(result.status === "ready" ? result.rows : []).toEqual([
        expect.objectContaining({
          id: "task7-evidence-review-low",
          scoreLabel: "66,7 баллов",
          relationLabel: `Оценка блока «${block}»`,
        }),
      ]);
    });

    it("requires a real comparable AI draft for agreement evidence", async () => {
      const criteria = [criterionId, otherCriterionId];
      const [descriptor] = buildReportEvidenceDescriptorCatalog({
        workspaceId,
        state,
        catalog,
        criteria,
        selection: {
          evidenceType: "driver",
          metric: "agreement",
          facet: { criterion: criterionId },
        },
      });
      const [otherDescriptor] = buildReportEvidenceDescriptorCatalog({
        workspaceId,
        state,
        catalog,
        criteria,
        selection: {
          evidenceType: "driver",
          metric: "agreement",
          facet: { criterion: otherCriterionId },
        },
      });
      expect(descriptor.key).not.toBe(otherDescriptor.key);
      const result = await resolveReportEvidence(
        {
          user: user(adminId, workspaceId, "ADMIN"),
          state: {
            ...state,
            evidenceType: "driver",
            evidenceKey: descriptor.key,
          },
        },
        { database: database! },
      );
      const otherResult = await resolveReportEvidence(
        {
          user: user(adminId, workspaceId, "ADMIN"),
          state: {
            ...state,
            evidenceType: "driver",
            evidenceKey: otherDescriptor.key,
          },
        },
        { database: database! },
      );

      expect(result.status).toBe("ready");
      expect(
        result.status === "ready" ? result.rows.map((row) => row.id) : [],
      ).toEqual(["task7-evidence-review-low"]);
      expect(
        otherResult.status === "ready"
          ? otherResult.rows.map((row) => row.id)
          : [],
      ).toEqual(["task7-evidence-review-low-na"]);
      expect(
        result.status === "ready" ? result.rows[0].relationLabel : "",
      ).toBe("Есть сопоставимая AI-оценка");
      expect(
        result.status === "ready" ? result.rows[0].scoreLabel : "",
      ).toBe("AI↔человек: есть сравнение");
    });

    it("buckets AI drift by draft createdAt rather than review finalizedAt", async () => {
      const [descriptor] = buildReportEvidenceDescriptorCatalog({
        workspaceId,
        state,
        catalog,
        selection: {
          evidenceType: "trend",
          metric: "ai-confidence",
          bucketStart: "2026-07-20",
        },
      });
      const result = await resolveReportEvidence(
        {
          user: user(adminId, workspaceId, "ADMIN"),
          state: {
            ...state,
            evidenceType: "trend",
            evidenceKey: descriptor.key,
          },
        },
        { database: database! },
      );

      expect(result.status).toBe("ready");
      expect(
        result.status === "ready" ? result.rows.map((row) => row.id) : [],
      ).toEqual([
        "task7-evidence-review-medium",
        "task7-evidence-review-low",
      ]);
      expect(
        result.status === "ready" ? result.rows[1].finalizedAt : "",
      ).toBe("2026-07-22T09:00:00.000Z");
      expect(
        result.status === "ready"
          ? result.rows.map((row) => row.scoreLabel)
          : [],
      ).toEqual(["Уверенность 90%", "Уверенность 41%"]);
    });

    it("matches trusted operator driver and operator-block matrix descriptors without exposing the operator", async () => {
      const [operatorDriver] = buildReportEvidenceDescriptorCatalog({
        workspaceId,
        state,
        catalog,
        operators: [operatorA, operatorB],
        selection: {
          evidenceType: "driver",
          metric: "operator-score",
          facet: { operator: operatorA },
        },
      });
      const [operatorMatrix] = buildReportEvidenceDescriptorCatalog({
        workspaceId,
        state,
        catalog,
        operators: [operatorA, operatorB],
        selection: {
          evidenceType: "matrix",
          metric: "operator-block",
          facet: {
            operator: operatorA,
            block: buildReportCatalogSlug(block),
          },
        },
      });
      expect(operatorDriver.key).not.toBe(operatorMatrix.key);

      const result = await resolveReportEvidence(
        {
          user: user(adminId, workspaceId, "ADMIN"),
          state: {
            ...state,
            evidenceType: "matrix",
            evidenceKey: operatorMatrix.key,
          },
        },
        { database: database! },
      );

      expect(result.status).toBe("ready");
      expect(
        result.status === "ready" ? result.rows.map((row) => row.id) : [],
      ).toEqual([
        "task7-evidence-review-critical-a",
        "task7-evidence-review-critical-b",
      ]);
      expect(JSON.stringify(result)).not.toContain(operatorA);
    });

    it("returns one byte-for-byte unavailable DTO for denied, foreign, stale, and deleted evidence", async () => {
      const [descriptor] = buildReportEvidenceDescriptorCatalog({
        workspaceId,
        state,
        catalog,
        selection: { evidenceType: "kpi", metric: "quality-score" },
      });
      const [foreignDescriptor] = buildReportEvidenceDescriptorCatalog({
        workspaceId: foreignWorkspaceId,
        state,
        catalog,
        selection: { evidenceType: "kpi", metric: "quality-score" },
      });
      const [deletedDescriptor] = buildReportEvidenceDescriptorCatalog({
        workspaceId,
        state,
        catalog,
        selection: {
          evidenceType: "driver",
          metric: "team-score",
          facet: { team: buildReportCatalogSlug(removedTeam) },
        },
      });
      expect(descriptor).toBeDefined();
      expect(foreignDescriptor).toBeDefined();
      expect(deletedDescriptor).toBeDefined();

      await database!.review.delete({ where: { id: excludedReviewIds[2] } });
      await database!.conversation.delete({
        where: { id: excludedConversationIds[2] },
      });

      const cases = [
        {
          user: user(viewerId, workspaceId, "VIEWER"),
          key: descriptor.key,
          type: "kpi" as const,
        },
        {
          user: user(adminId, workspaceId, "ADMIN"),
          key: foreignDescriptor.key,
          type: "kpi" as const,
        },
        {
          user: user(adminId, workspaceId, "ADMIN"),
          key: buildReportEvidenceKey(
            workspaceId,
            "kpi",
            '{"v":1,"stale":true}',
          ),
          type: "kpi" as const,
        },
        {
          user: user(adminId, workspaceId, "ADMIN"),
          key: deletedDescriptor.key,
          type: "driver" as const,
        },
      ];
      const results = [];
      for (const item of cases) {
        results.push(
          await resolveReportEvidence(
            {
              user: item.user,
              state: {
                ...state,
                evidenceType: item.type,
                evidenceKey: item.key,
              },
            },
            { database: database! },
          ),
        );
      }

      expect(results).toEqual([
        unavailableReportEvidence,
        unavailableReportEvidence,
        unavailableReportEvidence,
        unavailableReportEvidence,
      ]);
      const bytes = results.map((result) => JSON.stringify(result));
      expect(new Set(bytes).size).toBe(1);
    });
  });
