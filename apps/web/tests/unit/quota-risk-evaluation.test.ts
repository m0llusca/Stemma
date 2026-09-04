import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeWorkspaceQuotaTotals,
  evaluateWorkspaceQuotaRisk,
  hasRecentQuotaRiskNotification
} from "@/lib/reports/quota-risk-evaluation";

const mocks = vi.hoisted(() => ({
  enqueueQuotaRiskMessaging: vi.fn(async () => ({ id: "msg-job-1" }))
}));

vi.mock("@/lib/messaging/quota-risk", () => ({
  enqueueQuotaRiskMessaging: mocks.enqueueQuotaRiskMessaging
}));

function evaluationClient(overrides: {
  quotas?: Array<{ assigneeName: string; supportLine: string | null; plannedCount: number }>;
  reviews?: Array<{ conversation: { assigneeName: string | null; supportLine: string | null } }>;
  recentQuotaRiskJob?: { id: string } | null;
} = {}) {
  return {
    reviewQuota: {
      findMany: vi.fn(async () => overrides.quotas ?? [])
    },
    review: {
      findMany: vi.fn(async () => overrides.reviews ?? [])
    },
    backendJob: {
      findFirst: vi.fn(async () => overrides.recentQuotaRiskJob ?? null)
    }
  };
}

describe("computeWorkspaceQuotaTotals", () => {
  it("aggregates planned and actual counts across assignee rows", () => {
    const totals = computeWorkspaceQuotaTotals(
      [
        { assigneeName: "Alice", supportLine: null, plannedCount: 10 },
        { assigneeName: "Bob", supportLine: "Line A", plannedCount: 20 }
      ],
      [
        { conversation: { assigneeName: "Alice", supportLine: null } },
        { conversation: { assigneeName: "Alice", supportLine: null } },
        { conversation: { assigneeName: "Bob", supportLine: "Line A" } },
        { conversation: { assigneeName: "Bob", supportLine: "Line B" } }
      ]
    );

    expect(totals.plannedCount).toBe(30);
    expect(totals.actualCount).toBe(3);
    expect(totals.completionPercent).toBe(10);
  });
});

describe("hasRecentQuotaRiskNotification", () => {
  it("queries recent MESSAGING_DELIVERY quota.at_risk jobs", async () => {
    const client = evaluationClient();
    const now = new Date("2026-03-15T12:00:00.000Z");

    await hasRecentQuotaRiskNotification("workspace-1", client, now);

    expect(client.backendJob.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        workspaceId: "workspace-1",
        type: "MESSAGING_DELIVERY",
        status: { in: ["QUEUED", "RUNNING", "SUCCEEDED"] },
        payloadJson: { contains: '"eventType":"quota.at_risk"' }
      }),
      select: { id: true }
    });
    const calls = client.backendJob.findFirst.mock.calls as unknown as Array<
      [{ where: { createdAt: { gte: Date } } }]
    >;
    expect(calls[0]?.[0].where.createdAt.gte).toEqual(new Date("2026-03-15T00:00:00.000Z"));
  });
});

describe("evaluateWorkspaceQuotaRisk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enqueues one workspace-level notification when quota is behind plan", async () => {
    const client = evaluationClient({
      quotas: [
        { assigneeName: "Alice", supportLine: null, plannedCount: 10 },
        { assigneeName: "Bob", supportLine: null, plannedCount: 10 }
      ],
      reviews: Array.from({ length: 12 }, () => ({
        conversation: { assigneeName: "Alice", supportLine: null }
      }))
    });

    const result = await evaluateWorkspaceQuotaRisk(
      "workspace-1",
      client,
      new Date("2026-03-15T12:00:00.000Z")
    );

    expect(result).toEqual({
      notified: true,
      jobId: "msg-job-1",
      completionPercent: 60,
      actualCount: 12,
      plannedCount: 20
    });
    expect(mocks.enqueueQuotaRiskMessaging).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        completionPercent: 60,
        actualCount: 12,
        plannedCount: 20,
        href: "/reports?view=details"
      })
    );
    expect(mocks.enqueueQuotaRiskMessaging).toHaveBeenCalledTimes(1);
  });

  it("skips enqueue when the workspace quota plan is on track", async () => {
    const client = evaluationClient({
      quotas: [{ assigneeName: "Alice", supportLine: null, plannedCount: 5 }],
      reviews: Array.from({ length: 5 }, () => ({
        conversation: { assigneeName: "Alice", supportLine: null }
      }))
    });

    const result = await evaluateWorkspaceQuotaRisk(
      "workspace-1",
      client,
      new Date("2026-03-15T12:00:00.000Z")
    );

    expect(result).toEqual({
      notified: false,
      reason: "on_track",
      completionPercent: 100,
      actualCount: 5,
      plannedCount: 5
    });
    expect(mocks.enqueueQuotaRiskMessaging).not.toHaveBeenCalled();
  });

  it("skips enqueue when a recent quota.at_risk delivery job already exists", async () => {
    const client = evaluationClient({
      quotas: [{ assigneeName: "Alice", supportLine: null, plannedCount: 10 }],
      reviews: [{ conversation: { assigneeName: "Alice", supportLine: null } }],
      recentQuotaRiskJob: { id: "existing-job" }
    });

    const result = await evaluateWorkspaceQuotaRisk(
      "workspace-1",
      client,
      new Date("2026-03-15T12:00:00.000Z")
    );

    expect(result).toEqual({
      notified: false,
      reason: "recent_notification",
      completionPercent: 10,
      actualCount: 1,
      plannedCount: 10
    });
    expect(mocks.enqueueQuotaRiskMessaging).not.toHaveBeenCalled();
  });
});
