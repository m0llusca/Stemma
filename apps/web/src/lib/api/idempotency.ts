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

const FAILED_RECLAIM_ATTEMPTS = 3;

type IdempotencyReservationInput = {
  method: string;
  path: string;
  requestHash: string;
};

type IdempotencyReservation = {
  created: boolean;
  record: IdempotencyKey;
  isReplay: boolean;
  isInProgress: boolean;
  isConflict: boolean;
  needsRetry?: boolean;
};

function claimOwnedReservation(record: IdempotencyKey, expiresAt: Date) {
  return {
    created: true,
    record: { ...record, status: "IN_PROGRESS" as const, responseStatus: null, responseBodyJson: null, expiresAt },
    isReplay: false,
    isInProgress: false,
    isConflict: false
  };
}

function needsRetryReservation(record: IdempotencyKey) {
  return {
    created: false,
    record,
    isReplay: false,
    isInProgress: false,
    isConflict: false,
    needsRetry: true as const
  };
}

async function claimFailedReservation(
  record: IdempotencyKey,
  input: IdempotencyReservationInput,
  expiresAt: Date,
  attemptsLeft: number
): Promise<IdempotencyReservation> {
  const claimed = await prisma.idempotencyKey.updateMany({
    where: { id: record.id, status: "FAILED", requestHash: input.requestHash, method: input.method, path: input.path },
    data: { status: "IN_PROGRESS", responseStatus: null, responseBodyJson: null, expiresAt }
  });
  if (claimed.count === 1) {
    return claimOwnedReservation(record, expiresAt);
  }

  const current = await prisma.idempotencyKey.findUnique({ where: { id: record.id } });
  if (!current) {
    return needsRetryReservation(record);
  }
  if (current.status === "FAILED") {
    if (attemptsLeft > 1) {
      return claimFailedReservation(current, input, expiresAt, attemptsLeft - 1);
    }
    return needsRetryReservation(current);
  }
  return reservationFromRecord(current, input, expiresAt);
}

async function reservationFromRecord(
  record: IdempotencyKey,
  input: IdempotencyReservationInput,
  expiresAt: Date
): Promise<IdempotencyReservation> {
  const isConflict = record.requestHash !== input.requestHash || record.method !== input.method || record.path !== input.path;

  if (!isConflict && record.status === "FAILED") {
    return claimFailedReservation(record, input, expiresAt, FAILED_RECLAIM_ATTEMPTS);
  }

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
    if (existing.expiresAt.getTime() <= Date.now()) {
      // Expired reservations no longer count as replays/conflicts: drop the
      // stale row and fall through to a fresh reservation.
      const removed = await prisma.idempotencyKey.deleteMany({ where: { id: existing.id, expiresAt: { lte: new Date() } } });
      if (removed.count === 0) {
        const current = await prisma.idempotencyKey.findUnique({ where: { workspaceId_key: { workspaceId: input.workspaceId, key: input.key } } });
        if (current) return reservationFromRecord(current, input, expiresAt);
      }
    } else {
      return reservationFromRecord(existing, input, expiresAt);
    }
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

    return reservationFromRecord(racedRecord, input, expiresAt);
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
