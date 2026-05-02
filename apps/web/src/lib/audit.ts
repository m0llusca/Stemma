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

export function redactAuditMetadata(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactAuditMetadata(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        const normalizedKey = key.toLowerCase();

        if (
          normalizedKey.includes("token") ||
          normalizedKey.includes("authorization") ||
          normalizedKey.includes("password") ||
          normalizedKey.includes("secret")
        ) {
          return [key, "[redacted]"];
        }

        return [key, redactAuditMetadata(item)];
      })
    );
  }

  return value;
}

export async function auditLog(input: AuditLogInput, client: AuditLogClient = prisma) {
  return client.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: JSON.stringify(redactAuditMetadata(input.metadata))
    }
  });
}
