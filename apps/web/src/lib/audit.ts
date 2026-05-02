import { prisma } from "@/lib/db";

type AuditLogClient = Pick<typeof prisma, "auditLog">;

type AuditLogInput = {
  workspaceId: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: unknown;
};

export async function auditLog(input: AuditLogInput, client: AuditLogClient = prisma) {
  return client.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: JSON.stringify(input.metadata)
    }
  });
}
