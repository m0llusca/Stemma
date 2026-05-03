import { apiJson } from "@/lib/api/response";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;

    return apiJson({
      status: "ok",
      service: "support-qa-platform",
      database: "ok",
      latencyMs: Date.now() - startedAt
    });
  } catch {
    return apiJson(
      {
        status: "degraded",
        service: "support-qa-platform",
        database: "error",
        latencyMs: Date.now() - startedAt
      },
      503
    );
  }
}

