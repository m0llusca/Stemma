import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUserPermission: vi.fn(),
  getRuntimeConfigDiagnostics: vi.fn(),
  getPhaseDReadinessReport: vi.fn(),
  prisma: {
    backendJob: { count: vi.fn() },
    certificationRun: { findMany: vi.fn() },
    identityProvider: { count: vi.fn() },
    integration: { count: vi.fn() }
  }
}));

vi.mock("@/lib/current-user", () => ({
  requireCurrentUserPermission: mocks.requireCurrentUserPermission
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("@/lib/runtime-config", () => ({
  getRuntimeConfigDiagnostics: mocks.getRuntimeConfigDiagnostics
}));

vi.mock("@/lib/certification/readiness-report", () => ({
  getPhaseDReadinessReport: mocks.getPhaseDReadinessReport
}));

describe("readiness API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentUserPermission.mockResolvedValue({ workspaceId: "workspace-1" });
    mocks.prisma.backendJob.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    mocks.prisma.certificationRun.findMany.mockResolvedValue([
      {
        id: "cert-run-1",
        targetType: "integration",
        source: "zendesk",
        status: "failed",
        startedAt: new Date("2026-06-28T09:00:00.000Z"),
        finishedAt: null,
        nextActionJson: JSON.stringify({ label: "Проверить доступы" })
      }
    ]);
    mocks.prisma.identityProvider.count.mockResolvedValue(3);
    mocks.prisma.integration.count.mockResolvedValue(4);
    mocks.getRuntimeConfigDiagnostics.mockReturnValue({ status: "ok", checks: [] });
    mocks.getPhaseDReadinessReport.mockResolvedValue({
      generatedAt: "2026-05-25T10:00:00.000Z",
      summary: {
        total: 2,
        liveCertified: 0,
        readyForLiveCertification: 1,
        waitingForAccess: 1,
        failedOrLimited: 0
      },
      integrations: [],
      identityProviders: [],
      evidenceModel: {
        requiredFields: ["provider/source", "runId", "actor", "timestamp", "envGate", "result", "redactedDiagnostics"],
        protectedEnvGates: ["HELPDESK_LIVE_SMOKE=1", "protected:live-smoke"]
      }
    });
  });

  it("includes the Phase D readiness report with workspace diagnostics", async () => {
    const { GET } = await import("@/app/api/v1/readiness/route");
    const response = await GET(new Request("https://qc.example.com/api/v1/readiness"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.requireCurrentUserPermission).toHaveBeenCalledWith("backend_jobs:manage");
    expect(mocks.getPhaseDReadinessReport).toHaveBeenCalledWith("workspace-1");
    expect(mocks.prisma.certificationRun.findMany).toHaveBeenCalledWith({
      where: { workspaceId: "workspace-1" },
      orderBy: { startedAt: "desc" },
      take: 10,
      select: {
        id: true,
        targetType: true,
        source: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        nextActionJson: true
      }
    });
    expect(body).toMatchObject({
      status: "ready",
      workspace: {
        id: "workspace-1",
        queuedJobs: 2,
        failedJobs: 1,
        activeProviders: 3,
        activeIntegrations: 4
      },
      phaseD: {
        summary: {
          total: 2,
          liveCertified: 0
        }
      },
      certification: {
        latestRuns: [
          {
            id: "cert-run-1",
            targetType: "integration",
            source: "zendesk",
            status: "failed",
            startedAt: "2026-06-28T09:00:00.000Z",
            finishedAt: null,
            nextAction: { label: "Проверить доступы" }
          }
        ],
        evidenceModel: {
          protectedEnvGates: expect.arrayContaining(["protected:live-smoke"])
        }
      }
    });
  });
});
