import { prisma } from "@/lib/db";

type AuditLogClient = Pick<typeof prisma, "auditLog">;

type AuditLogInput = {
  workspaceId: string;
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata: unknown;
};

const REDACTED = "[redacted]";

function isSensitiveMetadataKey(key: string) {
  const normalizedKey = key.toLowerCase().replace(/[_-]/g, "");

  return (
    normalizedKey.includes("token") ||
    normalizedKey.includes("password") ||
    normalizedKey.includes("secret") ||
    normalizedKey.includes("authorization") ||
    normalizedKey.includes("rawbody") ||
    normalizedKey.includes("credential") ||
    normalizedKey.includes("apikey") ||
    normalizedKey.includes("cookie")
  );
}

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
        if (isSensitiveMetadataKey(key)) {
          return [key, REDACTED];
        }

        return [key, redactAuditMetadata(item)];
      })
    );
  }

  return value;
}

/** Parse BackendJob.payloadJson for read surfaces; never mutate the stored DB value. */
export function redactJobPayload(payloadJson: string): unknown {
  try {
    return redactAuditMetadata(JSON.parse(payloadJson) as unknown);
  } catch {
    return {};
  }
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
