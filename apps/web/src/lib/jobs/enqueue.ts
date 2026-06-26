import type { BackendJobType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type BackendJobPayload = Record<string, unknown>;

export type EnqueueJobClient = Pick<Prisma.TransactionClient, "backendJob">;

export async function enqueueBackendJob(input: {
  workspaceId: string;
  type: BackendJobType;
  payload?: BackendJobPayload;
  queueName?: string;
  priority?: number;
  runAfter?: Date;
  maxAttempts?: number;
  createdById?: string;
}, client: EnqueueJobClient = prisma) {
  return client.backendJob.create({
    data: {
      workspaceId: input.workspaceId,
      type: input.type,
      payloadJson: JSON.stringify(input.payload ?? {}),
      queueName: input.queueName ?? "default",
      priority: input.priority ?? 100,
      runAfter: input.runAfter ?? new Date(),
      maxAttempts: input.maxAttempts ?? 3,
      createdById: input.createdById
    }
  });
}
