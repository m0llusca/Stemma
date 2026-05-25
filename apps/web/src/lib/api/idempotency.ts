import { createHash } from "node:crypto";
import type { IdempotencyKey } from "@prisma/client";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export function readIdempotencyKey(request: NextRequest) {
  return request.headers.get("idempotency-key")?.trim() || null;
}

export function hashRequestBody(body: unknown) {
  return createHash("sha256").update(JSON.stringify(body), "utf8").digest("hex");
}

function isUniqueConstraintError(error: unknown) {
  return (
    (error !== null && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2002") ||
    (error instanceof Error && error.message.includes("Unique constraint failed"))
  );
}

function reservationFromRecord(
  record: IdempotencyKey,
  input: {
    method: string;
    path: string;
    requestHash: string;
  }
) {
  const isConflict = record.requestHash !== input.requestHash || record.method !== input.method || record.path !== input.path;

  return {
    created: false,
    record,
    isReplay: !isConflict && record.status === "COMPLETED",
    isInProgress: !isConflict && record.status === "IN_PROGRESS",
    isConflict
  };
}

export async function reserveIdempotencyKey(input: {
  workspaceId: string;
  key: string;
  method: string;
  path: string;
  requestHash: string;
  ttlMs?: number;
}) {
  const expiresAt = new Date(Date.now() + (input.ttlMs ?? 1000 * 60 * 60 * 24));
  const existing = await prisma.idempotencyKey.findUnique({
    where: {
      workspaceId_key: {
        workspaceId: input.workspaceId,
        key: input.key
      }
    }
  });

  if (existing) {
    return reservationFromRecord(existing, input);
  }

  let record: IdempotencyKey;

  try {
    record = await prisma.idempotencyKey.create({
      data: {
        workspaceId: input.workspaceId,
        key: input.key,
        method: input.method,
        path: input.path,
        requestHash: input.requestHash,
        expiresAt
      }
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const racedRecord = await prisma.idempotencyKey.findUnique({
      where: {
        workspaceId_key: {
          workspaceId: input.workspaceId,
          key: input.key
        }
      }
    });

    if (!racedRecord) {
      throw error;
    }

    return reservationFromRecord(racedRecord, input);
  }

  return {
    created: true,
    record,
    isReplay: false,
    isInProgress: false,
    isConflict: false
  };
}

export async function completeIdempotencyKey(input: {
  id: string;
  responseStatus: number;
  responseBody: unknown;
  failed?: boolean;
}) {
  await prisma.idempotencyKey.update({
    where: { id: input.id },
    data: {
      responseStatus: input.responseStatus,
      responseBodyJson: JSON.stringify(input.responseBody),
      status: input.failed ? "FAILED" : "COMPLETED"
    }
  });
}
