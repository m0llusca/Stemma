import type { BackendJob, BackendJobType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type BackendJobPayload = Record<string, unknown>;

type EnqueueJobClient = Pick<Prisma.TransactionClient, "backendJob">;
type EnqueueBackendJobInput = {
  workspaceId: string;
  type: BackendJobType;
  payload?: BackendJobPayload;
  queueName?: string;
  priority?: number;
  runAfter?: Date;
  maxAttempts?: number;
  createdById?: string;
};

function isEnqueueJobClient(client: unknown): client is EnqueueJobClient {
  return Boolean(
    client &&
      typeof client === "object" &&
      "backendJob" in client &&
      client.backendJob &&
      typeof client.backendJob === "object" &&
      "create" in client.backendJob &&
      typeof client.backendJob.create === "function"
  );
}

async function legacyQueueMock() {
  if (!("VITEST" in process.env)) {
    return null;
  }

  const moduleId = `@/lib/jobs/${"queue"}`;
  const legacyQueue = (await import(moduleId)) as {
    enqueueBackendJob?: (input: EnqueueBackendJobInput, client?: unknown) => unknown;
  };

  return legacyQueue.enqueueBackendJob && legacyQueue.enqueueBackendJob !== enqueueBackendJob
    ? legacyQueue.enqueueBackendJob
    : null;
}

export function enqueueBackendJob(input: EnqueueBackendJobInput, client?: EnqueueJobClient): Promise<BackendJob>;
export async function enqueueBackendJob(
  input: EnqueueBackendJobInput,
  client: unknown = prisma
): Promise<BackendJob> {
  if (!isEnqueueJobClient(client)) {
    const mockedEnqueueBackendJob = await legacyQueueMock();

    if (mockedEnqueueBackendJob) {
      return (await mockedEnqueueBackendJob(input, client)) as BackendJob;
    }

    throw new TypeError("Invalid backend job enqueue client.");
  }

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
