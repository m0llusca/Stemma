import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export function readIdempotencyKey(request: NextRequest) {
  return request.headers.get("idempotency-key")?.trim() || null;
}

export function hashRequestBody(body: unknown) {
  return createHash("sha256").update(JSON.stringify(body), "utf8").digest("hex");
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
    return {
      created: false,
      record: existing,
      isReplay: existing.status === "COMPLETED",
      isConflict: existing.requestHash !== input.requestHash || existing.method !== input.method || existing.path !== input.path
    };
  }

  const record = await prisma.idempotencyKey.create({
    data: {
      workspaceId: input.workspaceId,
      key: input.key,
      method: input.method,
      path: input.path,
      requestHash: input.requestHash,
      expiresAt
    }
  });

  return {
    created: true,
    record,
    isReplay: false,
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

