import { apiJson } from "@/lib/api/response";
import { prisma } from "@/lib/db";
import { getRuntimeConfigDiagnostics } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;

    return apiJson({
      status: "ok",
      service: "support-qa-platform",
      database: "ok",
      runtime: getRuntimeConfigDiagnostics().status,
      latencyMs: Date.now() - startedAt
    });
  } catch {
    return apiJson(
      {
        status: "degraded",
        service: "support-qa-platform",
        database: "error",
        runtime: getRuntimeConfigDiagnostics().status,
        latencyMs: Date.now() - startedAt
      },
      503
    );
  }
}
