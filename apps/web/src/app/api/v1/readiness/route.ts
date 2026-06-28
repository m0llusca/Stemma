import { apiJson } from "@/lib/api/response";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getPhaseDReadinessReport } from "@/lib/certification/readiness-report";
import { getRuntimeConfigDiagnostics } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";

function parseJsonObject(value: string | null | undefined) {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);

    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export async function GET() {
  const user = await requireCurrentUserPermission("backend_jobs:manage");
  const [queuedJobs, failedJobs, activeProviders, activeIntegrations, phaseD, latestRuns] = await Promise.all([
    prisma.backendJob.count({ where: { workspaceId: user.workspaceId, status: "QUEUED" } }),
    prisma.backendJob.count({ where: { workspaceId: user.workspaceId, status: "FAILED" } }),
    prisma.identityProvider.count({ where: { workspaceId: user.workspaceId, status: "active" } }),
    prisma.integration.count({ where: { workspaceId: user.workspaceId, status: "active" } }),
    getPhaseDReadinessReport(user.workspaceId),
    prisma.certificationRun.findMany({
      where: { workspaceId: user.workspaceId },
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
    })
  ]);
  const runtime = getRuntimeConfigDiagnostics();

  return apiJson({
    status: runtime.status === "error" ? "not_ready" : "ready",
    runtime,
    workspace: {
      id: user.workspaceId,
      queuedJobs,
      failedJobs,
      activeProviders,
      activeIntegrations
    },
    phaseD,
    certification: {
      latestRuns: latestRuns.map((run) => ({
        id: run.id,
        targetType: run.targetType,
        source: run.source,
        status: run.status,
        startedAt: run.startedAt.toISOString(),
        finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
        nextAction: parseJsonObject(run.nextActionJson)
      })),
      evidenceModel: phaseD.evidenceModel
    }
  });
}
