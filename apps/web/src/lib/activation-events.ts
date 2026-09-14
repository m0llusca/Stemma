/**
 * Product activation funnel events for the golden path:
 * live-cert → first import → first finalize → agent ack.
 * Emits structured backend logs (+ optional audit) so GTM can measure
 * time-to-first-certified-review without inventing a billing stack.
 */
import { auditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { logBackendEvent } from "@/lib/observability";

export type ActivationEventName =
  | "activation.live_cert_achieved"
  | "activation.first_import_completed"
  | "activation.first_review_finalized"
  | "activation.feedback_acknowledged";

const firstOnlyEvents = new Set<ActivationEventName>([
  "activation.first_import_completed",
  "activation.first_review_finalized"
]);

export async function hasActivationEvent(workspaceId: string, event: ActivationEventName) {
  const existing = await prisma.auditLog.findFirst({
    where: { workspaceId, action: event },
    select: { id: true }
  });
  return Boolean(existing);
}

export async function emitActivationEvent(input: {
  event: ActivationEventName;
  workspaceId: string;
  actorId?: string | null;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
  requestId?: string;
  /** When true (default for first_* events), skip if already audited for this workspace. */
  oncePerWorkspace?: boolean;
}) {
  const once =
    input.oncePerWorkspace ?? firstOnlyEvents.has(input.event);

  if (once && (await hasActivationEvent(input.workspaceId, input.event))) {
    return { emitted: false as const };
  }

  logBackendEvent({
    requestId: input.requestId,
    event: input.event,
    workspaceId: input.workspaceId,
    actorId: input.actorId ?? undefined,
    metadata: input.metadata
  });

  try {
    await auditLog({
      workspaceId: input.workspaceId,
      actorId: input.actorId ?? null,
      action: input.event,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata ?? {}
    });
  } catch {
    // Activation telemetry must never fail the user path.
  }

  return { emitted: true as const };
}
