import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { createDemoCalendar } from "../../prisma/demo-calendar";
import {
  demoEntityIds,
  prepareDemoSeed,
  runPreparedDemoSeed,
  type DemoSeedTransactionHost
} from "../../prisma/demo-seed-bootstrap";

const LOCAL_DB = "postgresql://user:pass@localhost:5432/mydb";
const ANCHOR = new Date("2026-07-27T12:00:00.000Z");

function testEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    DATABASE_URL: LOCAL_DB,
    ...overrides
  };
}

function transactionHost(events: string[] = []) {
  const transaction = { kind: "test-transaction" };

  return {
    transaction,
    host: {
      async $transaction<Result>(
        callback: (value: Prisma.TransactionClient) => Promise<Result>
      ) {
        events.push("transaction-start");
        return callback(transaction as unknown as Prisma.TransactionClient);
      }
    } satisfies DemoSeedTransactionHost
  };
}

describe("prepareDemoSeed", () => {
  it("prepares and validates the complete scenario before the first Prisma mutation", async () => {
    const events: string[] = [];
    const testTransaction = transactionHost(events);
    const firstPrismaMutation = vi.fn((prepared, transaction) => {
      events.push("first-prisma-mutation");
      expect(transaction).toBe(testTransaction.transaction);
      return prepared.ids;
    });

    const ids = await runPreparedDemoSeed(
      testEnv(),
      testTransaction.host,
      firstPrismaMutation,
      {
        assertSeedAllowed: () => {
          events.push("assert-seed-allowed");
        },
        resolveDemoSeedNow: () => {
          events.push("resolve-demo-now");
          return ANCHOR;
        },
        createDemoCalendar: (now) => {
          events.push("create-demo-calendar");
          return createDemoCalendar(now);
        },
        buildScenarios: () => {
          events.push("build-scenarios");
          return {
            reviewedSeeds: [],
            analyticalScenario: {
              reviews: [],
              criteria: [],
              aiDrafts: [],
              quotas: [],
              evidence: {
                "freshdesk-processes": [],
                "zendesk-improvement": [],
                "declining-team": [],
                "ai-drift": [],
                "high-plus": []
              },
              savedViews: [],
              aiStory: { confidenceDrops: 0, fallbackSpikes: 0, weekly: [] }
            },
            operationalSeeds: [],
            statusPlan: {
              trainingAssignmentStatuses: [],
              calibrationSessionStatuses: [],
              integrationStatuses: [],
              integrationRunStatuses: [],
              backendJobStatuses: [],
              reportSnapshotStatuses: []
            }
          };
        },
        validateDemoScenario: () => {
          events.push("validate-scenarios");
        }
      },
    );

    expect(ids).toEqual(demoEntityIds);
    expect(firstPrismaMutation).toHaveBeenCalledOnce();
    expect(events).toEqual([
      "assert-seed-allowed",
      "resolve-demo-now",
      "create-demo-calendar",
      "build-scenarios",
      "validate-scenarios",
      "transaction-start",
      "first-prisma-mutation"
    ]);
  });

  it("rejects an invalid DEMO_SEED_NOW before any Prisma mutation", async () => {
    const testTransaction = transactionHost();
    const firstPrismaMutation = vi.fn();

    await expect(
      runPreparedDemoSeed(
        testEnv({ DEMO_SEED_NOW: "2026-07-27" }),
        testTransaction.host,
        firstPrismaMutation
      )
    ).rejects.toThrow(/DEMO_SEED_NOW/);

    expect(firstPrismaMutation).not.toHaveBeenCalled();
  });

  it("returns deterministic identities and validated calendar-backed datasets", () => {
    const prepared = prepareDemoSeed(
      testEnv({ DEMO_SEED_NOW: "2026-07-27T12:00:00.000Z" })
    );

    expect(prepared.ids).toEqual({
      workspace: "demo-workspace",
      analyst: "demo-user-analyst",
      teamLead: "demo-user-team-lead",
      seniorAnalyst: "demo-user-senior-analyst"
    });
    expect(prepared.calendar.now.toISOString()).toBe(
      "2026-07-27T12:00:00.000Z"
    );
    expect(prepared.reviewedSeeds).toHaveLength(84);
    expect(prepared.operationalSeeds.length).toBeGreaterThan(0);
  });
});
