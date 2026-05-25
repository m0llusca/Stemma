import { apiError, apiJson, requestIdFromHeaders } from "@/lib/api/response";
import { requireSessionApi } from "@/lib/api/session";
import { prisma } from "@/lib/db";
import { enqueueBackendJob } from "@/lib/jobs/queue";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ providerId: string }> }) {
  const requestId = requestIdFromHeaders(request.headers);
  const session = await requireSessionApi(request, "auth_providers:manage", { requestId });

  if (!session.ok) {
    return session.response;
  }

  const user = session.user;
  const { providerId } = await context.params;
  const body = await request.json().catch(() => null);
  const dryRun = Boolean(body && typeof body === "object" && "dryRun" in body && (body as { dryRun?: unknown }).dryRun === true);
  const provider = await prisma.identityProvider.findFirst({
    where: {
      id: providerId,
      workspaceId: user.workspaceId
    },
    select: {
      id: true,
      name: true,
      type: true
    }
  });

  if (!provider) {
    return apiError("not_found", "Провайдер авторизации не найден.", 404, requestId);
  }

  const job = await enqueueBackendJob({
    workspaceId: user.workspaceId,
    type: "DIRECTORY_SYNC",
    queueName: "directory",
    priority: 70,
    createdById: user.id,
    payload: {
      providerId: provider.id,
      providerType: provider.type,
      ...(dryRun ? { dryRun: true } : {})
    }
  });

  return apiJson(
    {
      provider,
      job: {
        id: job.id,
        type: job.type,
        status: job.status
      }
    },
    202,
    requestId
  );
}
