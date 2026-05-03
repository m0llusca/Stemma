import { apiJson } from "@/lib/api/response";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return {};
  }
}

export async function GET() {
  const user = await requireCurrentUserPermission("reports:read");
  const snapshots = await prisma.reportSnapshot.findMany({
    where: { workspaceId: user.workspaceId },
    orderBy: [{ createdAt: "desc" }],
    take: 50,
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    }
  });

  return apiJson({
    snapshots: snapshots.map((snapshot) => ({
      id: snapshot.id,
      name: snapshot.name,
      periodStart: snapshot.periodStart.toISOString(),
      periodEnd: snapshot.periodEnd.toISOString(),
      filters: parseJson(snapshot.filtersJson),
      metrics: parseJson(snapshot.metricsJson),
      exportFormat: snapshot.exportFormat,
      status: snapshot.status,
      filePath: snapshot.filePath,
      fileSize: snapshot.fileSize,
      createdBy: snapshot.createdBy,
      createdAt: snapshot.createdAt.toISOString()
    }))
  });
}

