import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { apiError, apiJson, requestIdFromHeaders } from "@/lib/api/response";
import { requireSessionApi } from "@/lib/api/session";
import { prisma } from "@/lib/db";
import { createWebhookEndpoint } from "@/lib/webhooks/inbound";

export const dynamic = "force-dynamic";

const endpointSchema = z.object({
  source: z.string().trim().min(2).max(80).regex(/^[a-z0-9_-]+$/),
  name: z.string().trim().min(2).max(160),
  integrationId: z.string().trim().min(1).optional().nullable(),
  acceptedEvents: z.array(z.string().trim().min(1).max(120)).min(1).max(20).optional()
});

function serializeWebhookEndpoint(endpoint: {
  id: string;
  integrationId: string | null;
  source: string;
  name: string;
  status: string;
  acceptedEvents: string;
  secretPrefix: string;
  signingAlgorithm: string;
  lastReceivedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: endpoint.id,
    integrationId: endpoint.integrationId,
    source: endpoint.source,
    name: endpoint.name,
    status: endpoint.status,
    acceptedEvents: endpoint.acceptedEvents.split(",").map((item) => item.trim()).filter(Boolean),
    secretPrefix: endpoint.secretPrefix,
    signingAlgorithm: endpoint.signingAlgorithm,
    lastReceivedAt: endpoint.lastReceivedAt?.toISOString() ?? null,
    lastError: endpoint.lastError,
    createdAt: endpoint.createdAt.toISOString(),
    updatedAt: endpoint.updatedAt.toISOString()
  };
}

export async function GET(request: Request) {
  const requestId = requestIdFromHeaders(request.headers);
  const session = await requireSessionApi(request, "integrations:manage", { requestId });

  if (!session.ok) {
    return session.response;
  }

  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { workspaceId: session.user.workspaceId },
    orderBy: [{ updatedAt: "desc" }],
    select: {
      id: true,
      integrationId: true,
      source: true,
      name: true,
      status: true,
      acceptedEvents: true,
      secretPrefix: true,
      signingAlgorithm: true,
      lastReceivedAt: true,
      lastError: true,
      createdAt: true,
      updatedAt: true
    }
  });

  return apiJson(
    {
      webhookEndpoints: endpoints.map(serializeWebhookEndpoint)
    },
    200,
    requestId
  );
}

export async function POST(request: Request) {
  const requestId = requestIdFromHeaders(request.headers);
  const session = await requireSessionApi(request, "integrations:manage", { requestId });

  if (!session.ok) {
    return session.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = endpointSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("bad_request", "Некорректные параметры webhook endpoint.", 400, requestId, parsed.error.flatten());
  }

  if (parsed.data.integrationId) {
    const integration = await prisma.integration.findFirst({
      where: {
        id: parsed.data.integrationId,
        workspaceId: session.user.workspaceId
      },
      select: {
        id: true,
        source: true
      }
    });

    if (!integration) {
      return apiError("not_found", "Интеграция для webhook endpoint не найдена.", 404, requestId);
    }

    if (integration.source !== parsed.data.source) {
      return apiError("bad_request", "Webhook endpoint source must match the linked integration source.", 400, requestId);
    }
  }

  const created = await createWebhookEndpoint({
    workspaceId: session.user.workspaceId,
    source: parsed.data.source,
    name: parsed.data.name,
    integrationId: parsed.data.integrationId,
    acceptedEvents: parsed.data.acceptedEvents
  });

  await auditLog({
    workspaceId: session.user.workspaceId,
    actorId: session.user.id,
    action: "webhook_endpoint.created",
    targetType: "webhook_endpoint",
    targetId: created.endpoint.id,
    metadata: {
      source: created.endpoint.source,
      integrationId: created.endpoint.integrationId,
      acceptedEvents: created.endpoint.acceptedEvents
    }
  });

  return apiJson(
    {
      webhookEndpoint: {
        ...serializeWebhookEndpoint(created.endpoint),
        secret: created.secret
      }
    },
    201,
    requestId
  );
}
