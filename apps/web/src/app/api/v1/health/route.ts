import { apiJson, requestIdFromHeaders } from "@/lib/api/response";
import { requireSessionApi } from "@/lib/api/session";
import { prisma } from "@/lib/db";
import { getRuntimeConfigDiagnostics } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";

async function canViewHealthDetails(request: Request, requestId: string) {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  const session = await requireSessionApi(request, "backend_jobs:manage", { requestId });
  return session.ok;
}

export async function GET(request: Request) {
  const requestId = requestIdFromHeaders(request.headers);
  const startedAt = Date.now();
  const includeDetails = await canViewHealthDetails(request, requestId);

  try {
    await prisma.$queryRaw`SELECT 1`;

    if (!includeDetails) {
      return apiJson({ status: "ok" }, 200, requestId);
    }

    const runtime = getRuntimeConfigDiagnostics();

    return apiJson(
      {
        status: "ok",
        service: "support-qa-platform",
        database: "ok",
        runtime,
        latencyMs: Date.now() - startedAt
      },
      200,
      requestId
    );
  } catch {
    if (!includeDetails) {
      return apiJson({ status: "degraded" }, 503, requestId);
    }

    const runtime = getRuntimeConfigDiagnostics();

    return apiJson(
      {
        status: "degraded",
        service: "support-qa-platform",
        database: "error",
        runtime,
        latencyMs: Date.now() - startedAt
      },
      503,
      requestId
    );
  }
}
