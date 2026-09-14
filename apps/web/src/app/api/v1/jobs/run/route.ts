import { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiToken } from "@/lib/api-auth";
import { auditLog } from "@/lib/audit";
import { apiError, apiJson, requestIdFromHeaders } from "@/lib/api/response";
import { requireSessionApi } from "@/lib/api/session";
import { runDueBackendJobs } from "@/lib/jobs/queue";
import { reportQueueAgeIfNeeded } from "@/lib/jobs/queue-health";
import { logBackendEvent } from "@/lib/observability";

export const dynamic = "force-dynamic";

const runJobsSchema = z.object({
  limit: z.number().int().min(1).max(20).optional(),
  workerId: z.string().trim().min(1).max(120).optional()
});

type JobsRunActor =
  | { kind: "session"; workspaceId: string; actorId: string }
  | { kind: "token"; workspaceId: string; apiTokenId: string };

async function resolveJobsRunActor(
  request: Request,
  requestId: string
): Promise<{ ok: true; actor: JobsRunActor } | { ok: false; response: Response }> {
  const hasApiCredential =
    Boolean(request.headers.get("authorization")?.toLowerCase().startsWith("bearer ")) ||
    Boolean(request.headers.get("x-api-key")?.trim());

  if (hasApiCredential) {
    const token = await requireApiToken(
      new NextRequest(request.url, request),
      "jobs:write",
      { requestId, structuredErrors: true }
    );
    if (!token.ok) {
      return { ok: false, response: token.response };
    }
    return {
      ok: true,
      actor: {
        kind: "token",
        workspaceId: token.workspaceId,
        apiTokenId: token.apiTokenId
      }
    };
  }

  const session = await requireSessionApi(request, "backend_jobs:manage", {
    requestId
  });
  if (!session.ok) {
    return { ok: false, response: session.response };
  }
  return {
    ok: true,
    actor: {
      kind: "session",
      workspaceId: session.user.workspaceId,
      actorId: session.user.id
    }
  };
}

export async function POST(request: Request) {
  const requestId = requestIdFromHeaders(request.headers);
  const auth = await resolveJobsRunActor(request, requestId);

  if (!auth.ok) {
    return auth.response;
  }

  const { actor } = auth;
  const body = await request.json().catch(() => ({}));
  const parsed = runJobsSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(
      "bad_request",
      "Некорректные параметры запуска очереди.",
      400,
      requestId,
      parsed.error.flatten()
    );
  }

  const results = await runDueBackendJobs({
    ...parsed.data,
    workspaceId: actor.workspaceId
  });
  await reportQueueAgeIfNeeded(actor.workspaceId, requestId);
  logBackendEvent({
    requestId,
    event: "backend_jobs.run_requested",
    workspaceId: actor.workspaceId,
    actorId: actor.kind === "session" ? actor.actorId : undefined,
    metadata: {
      processed: results.length,
      auth: actor.kind,
      apiTokenId: actor.kind === "token" ? actor.apiTokenId : undefined
    }
  });

  try {
    await auditLog({
      workspaceId: actor.workspaceId,
      actorId: actor.kind === "session" ? actor.actorId : null,
      action: "backend_jobs.run_requested",
      targetType: "backend_jobs",
      targetId: parsed.data.workerId ?? "manual",
      metadata: {
        processed: results.length,
        workerId: parsed.data.workerId ?? null,
        auth: actor.kind,
        apiTokenId: actor.kind === "token" ? actor.apiTokenId : null
      }
    });
  } catch (error) {
    logBackendEvent({
      level: "error",
      requestId,
      event: "backend_jobs.run_audit_failed",
      workspaceId: actor.workspaceId,
      actorId: actor.kind === "session" ? actor.actorId : undefined,
      metadata: {
        message: error instanceof Error ? error.message : "Unknown audit logging error"
      }
    });
  }

  return apiJson(
    {
      processed: results.length,
      results
    },
    200,
    requestId
  );
}
