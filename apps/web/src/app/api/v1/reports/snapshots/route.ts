import { apiJson, requestIdFromHeaders } from "@/lib/api/response";
import { requireSessionApi } from "@/lib/api/session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return {};
  }
}

export async function GET(request: Request) {
  const requestId = requestIdFromHeaders(request.headers);
  const session = await requireSessionApi(request, "reports:read", { requestId });

  if (!session.ok) {
    return session.response;
  }

  const user = session.user;
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

  return apiJson(
    {
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
    },
    200,
    requestId
  );
}
