import { apiJson } from "@/lib/api/response";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getPhaseDReadinessReport } from "@/lib/certification/readiness-report";
import { getRuntimeConfigDiagnostics } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireCurrentUserPermission("backend_jobs:manage");
  const [queuedJobs, failedJobs, activeProviders, activeIntegrations, phaseD] = await Promise.all([
    prisma.backendJob.count({ where: { workspaceId: user.workspaceId, status: "QUEUED" } }),
    prisma.backendJob.count({ where: { workspaceId: user.workspaceId, status: "FAILED" } }),
    prisma.identityProvider.count({ where: { workspaceId: user.workspaceId, status: "active" } }),
    prisma.integration.count({ where: { workspaceId: user.workspaceId, status: "active" } }),
    getPhaseDReadinessReport(user.workspaceId)
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
    phaseD
  });
}
