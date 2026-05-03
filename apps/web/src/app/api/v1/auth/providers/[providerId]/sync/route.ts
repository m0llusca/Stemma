import { apiError, apiJson } from "@/lib/api/response";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { enqueueBackendJob } from "@/lib/jobs/queue";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ providerId: string }> }) {
  const user = await requireCurrentUserPermission("auth_providers:manage");
  const { providerId } = await context.params;
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
    return apiError("not_found", "Провайдер авторизации не найден.", 404);
  }

  const job = await enqueueBackendJob({
    workspaceId: user.workspaceId,
    type: "DIRECTORY_SYNC",
    queueName: "directory",
    priority: 70,
    createdById: user.id,
    payload: {
      providerId: provider.id,
      providerType: provider.type
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
    202
  );
}

