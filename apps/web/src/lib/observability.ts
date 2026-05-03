import { randomUUID } from "node:crypto";

type LogLevel = "info" | "warn" | "error";

export function requestIdFromHeaders(headers: Headers) {
  return headers.get("x-request-id")?.trim() || randomUUID();
}

export function logBackendEvent(input: {
  level?: LogLevel;
  requestId?: string;
  event: string;
  workspaceId?: string;
  actorId?: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}) {
  const payload = {
    ts: new Date().toISOString(),
    level: input.level ?? "info",
    event: input.event,
    requestId: input.requestId,
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    targetType: input.targetType,
    targetId: input.targetId,
    metadata: input.metadata ?? {}
  };

  const line = JSON.stringify(payload);

  if (payload.level === "error") {
    console.error(line);
    return;
  }

  if (payload.level === "warn") {
    console.warn(line);
    return;
  }

  console.info(line);
}

