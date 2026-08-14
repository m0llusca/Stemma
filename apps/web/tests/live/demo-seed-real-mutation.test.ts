import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolvePlaywrightTestDatabaseUrl } from "../../playwright-database-guard";
import { runPreparedDemoSeed } from "../../prisma/demo-seed-bootstrap";
import { mutateDemoSeed } from "../../prisma/demo-seed-mutation";

const hasTestDatabaseUrl = Boolean(process.env.TEST_DATABASE_URL);
const databaseUrl = hasTestDatabaseUrl
  ? resolvePlaywrightTestDatabaseUrl(process.env)
  : undefined;
const seedEnv = {
  ...process.env,
  NODE_ENV: "test",
  DATABASE_URL: databaseUrl,
  DEMO_SEED_NOW: "2026-07-28T09:00:00.000Z"
} satisfies NodeJS.ProcessEnv;
const prisma = new PrismaClient(
  databaseUrl
    ? {
        datasources: {
          db: {
            url: databaseUrl
          }
        }
      }
    : undefined
);

const foreignWorkspaceId = "task1-integration-foreign-workspace";
const foreignUserId = "task1-integration-foreign-user";

async function removeForeignFixture() {
  await prisma.user.deleteMany({
    where: {
      id: foreignUserId,
      workspaceId: foreignWorkspaceId
    }
  });
  await prisma.workspace.deleteMany({
    where: {
      id: foreignWorkspaceId
    }
  });
}

async function demoSnapshot() {
  const workspaceId = "demo-workspace";
  const [workspaces, users, conversations, reviews] = await Promise.all([
    prisma.workspace.count({ where: { id: workspaceId } }),
    prisma.user.count({ where: { workspaceId } }),
    prisma.conversation.count({ where: { workspaceId } }),
    prisma.review.count({ where: { workspaceId } })
  ]);

  return { workspaces, users, conversations, reviews };
}

type IdentityRow = {
  model: string;
  id: string;
  workspaceId: string;
  createdAt: string | null;
  updatedAt: string | null;
};

function identityRow(
  model: string,
  workspaceId: string,
  row: { id: string; createdAt?: Date | null; updatedAt?: Date | null }
): IdentityRow {
  return {
    model,
    id: row.id,
    workspaceId,
    createdAt: row.createdAt?.toISOString() ?? null,
    updatedAt: row.updatedAt?.toISOString() ?? null
  };
}

async function analyticalIdentitySnapshot() {
  const workspaceId = "demo-workspace";
  const [
    workspace,
    operators,
    conversations,
    messages,
    scorecard,
    criteria,
    reviews,
    scores,
    findings,
    coachingActions,
    aiDrafts,
    quotas,
    savedViews
  ] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { id: true, createdAt: true, updatedAt: true }
    }),
    prisma.user.findMany({
      where: { workspaceId, id: { startsWith: "demo-operator-" } },
      select: { id: true, createdAt: true, updatedAt: true }
    }),
    prisma.conversation.findMany({
      where: { workspaceId, id: { startsWith: "demo-conversation-" } },
      select: { id: true, createdAt: true, updatedAt: true }
    }),
    prisma.message.findMany({
      where: {
        conversation: {
          workspaceId,
          id: { startsWith: "demo-conversation-" }
        }
      },
      select: { id: true, createdAt: true }
    }),
    prisma.scorecard.findUniqueOrThrow({
      where: { id: "demo-scorecard-v1" },
      select: { id: true, createdAt: true, updatedAt: true }
    }),
    prisma.scorecardCriterion.findMany({
      where: {
        scorecardId: "demo-scorecard-v1",
        id: { startsWith: "demo-criterion-" }
      },
      select: { id: true }
    }),
    prisma.review.findMany({
      where: {
        workspaceId,
        id: { startsWith: "demo-review-" },
        reviewSource: "HUMAN",
        status: "FINALIZED"
      },
      select: { id: true, createdAt: true, updatedAt: true }
    }),
    prisma.criterionScore.findMany({
      where: {
        id: { startsWith: "demo-score-" },
        review: { workspaceId, reviewSource: "HUMAN", status: "FINALIZED" }
      },
      select: { id: true }
    }),
    prisma.finding.findMany({
      where: {
        id: { startsWith: "demo-finding-" },
        review: { workspaceId }
      },
      select: { id: true, createdAt: true }
    }),
    prisma.coachingAction.findMany({
      where: {
        id: { startsWith: "demo-coaching-" },
        finding: { review: { workspaceId } }
      },
      select: { id: true, createdAt: true, updatedAt: true }
    }),
    prisma.aiQualityDraft.findMany({
      where: { workspaceId, id: { startsWith: "demo-ai-score-" } },
      select: { id: true, createdAt: true, updatedAt: true }
    }),
    prisma.reviewQuota.findMany({
      where: { workspaceId, id: { startsWith: "demo-quota-operator-" } },
      select: { id: true, createdAt: true, updatedAt: true }
    }),
    prisma.savedReportView.findMany({
      where: { workspaceId, id: { startsWith: "demo-saved-report-" } },
      select: { id: true, createdAt: true, updatedAt: true }
    })
  ]);

  return [
    identityRow("Workspace", workspaceId, workspace),
    ...operators.map((row) => identityRow("User", workspaceId, row)),
    ...conversations.map((row) => identityRow("Conversation", workspaceId, row)),
    ...messages.map((row) => identityRow("Message", workspaceId, row)),
    identityRow("Scorecard", workspaceId, scorecard),
    ...criteria.map((row) => identityRow("ScorecardCriterion", workspaceId, row)),
    ...reviews.map((row) => identityRow("Review", workspaceId, row)),
    ...scores.map((row) => identityRow("CriterionScore", workspaceId, row)),
    ...findings.map((row) => identityRow("Finding", workspaceId, row)),
    ...coachingActions.map((row) => identityRow("CoachingAction", workspaceId, row)),
    ...aiDrafts.map((row) => identityRow("AiQualityDraft", workspaceId, row)),
    ...quotas.map((row) => identityRow("ReviewQuota", workspaceId, row)),
    ...savedViews.map((row) => identityRow("SavedReportView", workspaceId, row))
  ].sort(
    (left, right) =>
      left.model.localeCompare(right.model) || left.id.localeCompare(right.id)
  );
}

describe.skipIf(!hasTestDatabaseUrl).sequential("real demo seed mutation safety", () => {
  beforeAll(async () => {
    const [identity] = await prisma.$queryRaw<
      Array<{ database: string; schema: string }>
    >`SELECT current_database() AS database, current_schema() AS schema`;

    expect(identity).toEqual({
      database: "qc_app_demo_verify",
      schema: "public"
    });

    await removeForeignFixture();
    await prisma.workspace.create({
      data: {
        id: foreignWorkspaceId,
        name: "Task 1 integration foreign workspace"
      }
    });
    await prisma.user.create({
      data: {
        id: foreignUserId,
        workspaceId: foreignWorkspaceId,
        email: "task1-integration-foreign@example.invalid",
        name: "Task 1 integration foreign user",
        role: "VIEWER"
      }
    });
  });

  afterAll(async () => {
    await removeForeignFixture();
    await prisma.$disconnect();
  });

  it(
    "runs the real mutator without deleting foreign rows and rolls back a forced mid-seed failure",
    async () => {
      await runPreparedDemoSeed(seedEnv, prisma, mutateDemoSeed);

      const foreignUser = await prisma.user.findUnique({
        where: { id: foreignUserId }
      });
      expect(foreignUser).toMatchObject({
        workspaceId: foreignWorkspaceId,
        email: "task1-integration-foreign@example.invalid"
      });

      const beforeRollback = await demoSnapshot();
      expect(beforeRollback.workspaces).toBe(1);
      expect(beforeRollback.users).toBeGreaterThan(0);
      expect(beforeRollback.conversations).toBeGreaterThan(0);
      expect(beforeRollback.reviews).toBeGreaterThan(0);

      await expect(
        runPreparedDemoSeed(seedEnv, prisma, (prepared, transaction) =>
          mutateDemoSeed(prepared, transaction, {
            afterWorkspaceUpsert: () => {
              throw new Error("forced real mid-seed failure");
            }
          })
        )
      ).rejects.toThrow("forced real mid-seed failure");

      expect(await demoSnapshot()).toEqual(beforeRollback);
      await expect(
        prisma.user.findUnique({ where: { id: foreignUserId } })
      ).resolves.toMatchObject({
        workspaceId: foreignWorkspaceId
      });
    },
    60_000
  );

  it(
    "keeps the full bounded analytical identity set literal-equal across two successful runs",
    async () => {
      await runPreparedDemoSeed(seedEnv, prisma, mutateDemoSeed);
      const first = await analyticalIdentitySnapshot();

      await runPreparedDemoSeed(seedEnv, prisma, mutateDemoSeed);
      const second = await analyticalIdentitySnapshot();

      expect(second).toEqual(first);
      expect(
        second.filter((row) => row.model === "Review")
      ).toHaveLength(84);
      expect(
        second.filter((row) => row.model === "CriterionScore")
      ).toHaveLength(1344);
      expect(
        second.filter((row) => row.model === "AiQualityDraft")
      ).toHaveLength(12);
      expect(
        second.filter((row) => row.model === "SavedReportView")
      ).toHaveLength(4);
    },
    60_000
  );
});
