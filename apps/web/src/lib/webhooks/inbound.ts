import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  buildIntegrationSyncState,
  integrationRunCursorPayload,
  serializeIntegrationSyncState
} from "@/lib/integrations/sync-state";
import { decryptSecret, encryptSecret } from "@/lib/secrets";
import { upsertCustomConversation } from "@/lib/conversation-import";
import { customConversationSchema, type CustomConversationInput } from "@/lib/validation/custom-api";

export const webhookSignatureToleranceMs = 5 * 60_000;
export const webhookReceivedReclaimMs = 30 * 60_000;
const signaturePrefix = "sha256=";

const webhookEnvelopeSchema = z.object({
  eventType: z.string().trim().min(1).optional().default("conversation.upsert"),
  conversation: customConversationSchema
});

export type WebhookIngestResult = {
  status: "processed" | "duplicate";
  eventId: string;
  conversationId: string | null;
};

export function createPlainWebhookSecret() {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}

export function webhookSecretPrefix(secret: string) {
  return `${secret.slice(0, 10)}...`;
}

export function signWebhookPayload(input: { secret: string; timestamp: string; payload: string }) {
  const digest = createHmac("sha256", input.secret).update(`${input.timestamp}.${input.payload}`, "utf8").digest("hex");
  return `${signaturePrefix}${digest}`;
}

function constantTimeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyWebhookSignature(input: {
  secret: string;
  payload: string;
  timestamp: string | null;
  signature: string | null;
  now?: Date;
}) {
  if (!input.timestamp || !input.signature?.startsWith(signaturePrefix)) {
    return false;
  }

  const timestampMs = Number(input.timestamp);

  if (!Number.isFinite(timestampMs)) {
    return false;
  }

  const now = input.now ?? new Date();

  if (Math.abs(now.getTime() - timestampMs) > webhookSignatureToleranceMs) {
    return false;
  }

  const expected = signWebhookPayload({
    secret: input.secret,
    timestamp: input.timestamp,
    payload: input.payload
  }).slice(signaturePrefix.length);
  const received = input.signature.slice(signaturePrefix.length);

  return constantTimeEquals(expected, received);
}

export function webhookRequestHash(payload: string) {
  return createHmac("sha256", "qc_webhook_request").update(payload, "utf8").digest("hex");
}

export function parseWebhookConversationPayload(payload: unknown): { eventType: string; conversation: CustomConversationInput } {
  if (payload && typeof payload === "object" && !Array.isArray(payload) && "conversation" in payload) {
    const parsed = webhookEnvelopeSchema.parse(payload);
    return parsed;
  }

  return {
    eventType: "conversation.upsert",
    conversation: customConversationSchema.parse(payload)
  };
}

export async function createWebhookEndpoint(input: {
  workspaceId: string;
  source: string;
  name: string;
  integrationId?: string | null;
  acceptedEvents?: string[];
}) {
  const secret = createPlainWebhookSecret();
  const endpoint = await prisma.webhookEndpoint.create({
    data: {
      workspaceId: input.workspaceId,
      source: input.source,
      name: input.name,
      integrationId: input.integrationId ?? null,
      acceptedEvents: (input.acceptedEvents?.length ? input.acceptedEvents : ["conversation.upsert"]).join(","),
      secretPrefix: webhookSecretPrefix(secret),
      encryptedSecret: encryptSecret(secret)
    }
  });

  return { endpoint, secret };
}

function acceptedEventsSet(value: string) {
  return new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function isUniqueConstraintError(error: unknown) {
  return (
    (error !== null && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2002") ||
    (error instanceof Error && error.message.includes("Unique constraint failed"))
  );
}

type ExistingWebhookEventClaim = {
  existing: {
    id: string;
    requestHash: string;
    status: string;
    conversationId: string | null;
    receivedAt: Date;
  };
  requestHash: string;
  eventType: string;
  source: string;
  signatureVerified: boolean;
  payloadJson: string;
  now: Date;
};

function isStaleReceivedEvent(input: ExistingWebhookEventClaim) {
  return input.existing.status === "received" && input.existing.receivedAt.getTime() <= input.now.getTime() - webhookReceivedReclaimMs;
}

async function claimExistingWebhookEvent(input: ExistingWebhookEventClaim) {
  if (input.existing.requestHash !== input.requestHash) {
    throw new Error("Webhook idempotency key was already used with a different payload.");
  }

  if (input.existing.status === "processed") {
    return {
      kind: "duplicate" as const,
      result: {
        status: "duplicate",
        eventId: input.existing.id,
        conversationId: input.existing.conversationId
      } satisfies WebhookIngestResult
    };
  }

  const canClaim = input.existing.status === "failed" || isStaleReceivedEvent(input);

  if (!canClaim) {
    throw new Error("Webhook idempotency key is already being processed.");
  }

  const claimed = await prisma.webhookIngestEvent.updateMany({
    where: {
      id: input.existing.id,
      requestHash: input.requestHash,
      ...(input.existing.status === "failed"
        ? { status: "failed" }
        : {
            status: "received",
            receivedAt: {
              lte: new Date(input.now.getTime() - webhookReceivedReclaimMs)
            }
          })
    },
    data: {
      integrationRunId: null,
      conversationId: null,
      eventType: input.eventType,
      source: input.source,
      status: "received",
      signatureVerified: input.signatureVerified,
      payloadJson: input.payloadJson,
      errorMessage: null,
      receivedAt: input.now,
      processedAt: null
    }
  });

  if (claimed.count !== 1) {
    throw new Error("Webhook idempotency key is already being processed.");
  }

  return {
    kind: "process" as const,
    event: {
      id: input.existing.id
    }
  };
}

export async function ingestWebhookEvent(input: {
  endpointId: string;
  workspaceId?: string;
  rawBody: string;
  idempotencyKey: string;
  timestamp: string | null;
  signature: string | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const endpoint = await prisma.webhookEndpoint.findFirst({
    where: {
      id: input.endpointId,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      status: "active"
    },
    include: {
      integration: true
    }
  });

  if (!endpoint) {
    throw new Error("Webhook endpoint not found or disabled.");
  }

  if ((endpoint.integrationId && !endpoint.integration) || (endpoint.integration && endpoint.integration.status !== "active")) {
    throw new Error("Webhook endpoint not found or disabled.");
  }

  const secret = decryptSecret(endpoint.encryptedSecret);
  const signatureVerified = verifyWebhookSignature({
    secret,
    payload: input.rawBody,
    timestamp: input.timestamp,
    signature: input.signature,
    now
  });

  if (!signatureVerified) {
    await prisma.webhookEndpoint.update({
      where: { id: endpoint.id },
      data: {
        lastReceivedAt: new Date(),
        lastError: "Invalid webhook signature."
      }
    });
    throw new Error("Invalid webhook signature.");
  }

  const requestHash = webhookRequestHash(input.rawBody);
  const json = JSON.parse(input.rawBody) as unknown;
  const parsed = parseWebhookConversationPayload(json);

  if (!acceptedEventsSet(endpoint.acceptedEvents).has(parsed.eventType)) {
    throw new Error(`Webhook event type is not accepted by this endpoint: ${parsed.eventType}`);
  }

  let event;
  const existingBeforeCreate = await prisma.webhookIngestEvent.findUnique({
    where: {
      endpointId_idempotencyKey: {
        endpointId: endpoint.id,
        idempotencyKey: input.idempotencyKey
      }
    }
  });

  if (existingBeforeCreate) {
    const claimed = await claimExistingWebhookEvent({
      existing: existingBeforeCreate,
      requestHash,
      eventType: parsed.eventType,
      source: endpoint.source,
      signatureVerified,
      payloadJson: JSON.stringify(json),
      now
    });

    if (claimed.kind === "duplicate") {
      return claimed.result;
    }

    event = claimed.event;
  }

  if (!event) {
    try {
      event = await prisma.webhookIngestEvent.create({
        data: {
          workspaceId: endpoint.workspaceId,
          endpointId: endpoint.id,
          idempotencyKey: input.idempotencyKey,
          eventType: parsed.eventType,
          source: endpoint.source,
          status: "received",
          requestHash,
          signatureVerified,
          payloadJson: JSON.stringify(json)
        }
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const existing = await prisma.webhookIngestEvent.findUnique({
          where: {
            endpointId_idempotencyKey: {
              endpointId: endpoint.id,
              idempotencyKey: input.idempotencyKey
            }
          }
        });

        if (!existing) {
          throw error;
        }

        const claimed = await claimExistingWebhookEvent({
          existing,
          requestHash,
          eventType: parsed.eventType,
          source: endpoint.source,
          signatureVerified,
          payloadJson: JSON.stringify(json),
          now
        });

        if (claimed.kind === "duplicate") {
          return claimed.result;
        }

        event = claimed.event;
      } else {
        throw error;
      }

    }
  }

  try {
    const processed = await prisma.$transaction(async (tx) => {
      const run = endpoint.integrationId
        ? await tx.integrationRun.create({
            data: {
              workspaceId: endpoint.workspaceId,
              integrationId: endpoint.integrationId,
              source: endpoint.source,
              mode: "webhook_ingest",
              status: "processing",
              dryRun: false,
              requestedLimit: 1,
              checkedCount: 1
            }
          })
        : null;
      const conversation = {
        ...parsed.conversation,
        externalSource: endpoint.source
      };
      const imported = await upsertCustomConversation(endpoint.workspaceId, conversation, tx);
      const syncState = endpoint.integrationId
        ? buildIntegrationSyncState({
            source: endpoint.source,
            mode: endpoint.integration?.type ?? "webhook_ingest",
            cursor: imported.externalId,
            checkedCount: 1,
            importedCount: 1,
            skippedCount: 0,
            errorCount: 0,
            checkpoint: {
              webhookEventId: event.id,
              idempotencyKey: input.idempotencyKey,
              conversationId: imported.id,
              externalId: imported.externalId
            }
          })
        : null;

      if (run) {
        await tx.integrationRunItem.create({
          data: {
            workspaceId: endpoint.workspaceId,
            integrationRunId: run.id,
            externalId: conversation.externalId,
            ticketNumber: conversation.externalId,
            status: "imported",
            articleCount: conversation.messages.length,
            privateArticleCount: conversation.messages.filter((message) => message.isPrivate).length,
            attachmentCount: 0,
            warningsJson: "[]",
            errorsJson: "[]",
            conversationId: imported.id,
            normalizedPreviewJson: JSON.stringify(conversation)
          }
        });
      }

      await tx.webhookIngestEvent.update({
        where: { id: event.id },
        data: {
          status: "processed",
          integrationRunId: run?.id ?? null,
          conversationId: imported.id,
          processedAt: new Date()
        }
      });

      if (run && syncState) {
        await tx.integrationRun.update({
          where: { id: run.id },
          data: {
            status: "succeeded",
            importedCount: 1,
            errorCount: 0,
            cursorJson: JSON.stringify(integrationRunCursorPayload(syncState)),
            checkpointJson: JSON.stringify(syncState.checkpoint),
            finishedAt: new Date()
          }
        });
      }

      if (endpoint.integrationId && syncState) {
        const updatedIntegration = await tx.integration.updateMany({
          where: {
            id: endpoint.integrationId,
            workspaceId: endpoint.workspaceId,
            status: "active"
          },
          data: {
            lastSyncedAt: new Date(),
            lastImportAt: new Date(),
            lastError: null,
            syncStateJson: serializeIntegrationSyncState(syncState),
            syncCursor: imported.externalId
          }
        });

        if (updatedIntegration.count !== 1) {
          throw new Error("Webhook endpoint not found or disabled.");
        }
      }

      await tx.webhookEndpoint.update({
        where: { id: endpoint.id },
        data: {
          lastReceivedAt: new Date(),
          lastError: null
        }
      });

      return imported;
    });

    return {
      status: "processed",
      eventId: event.id,
      conversationId: processed.id
    } satisfies WebhookIngestResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed.";
    await prisma.webhookIngestEvent.update({
      where: { id: event.id },
      data: {
        status: "failed",
        errorMessage: message,
        processedAt: new Date()
      }
    });
    await prisma.webhookEndpoint.update({
      where: { id: endpoint.id },
      data: {
        lastReceivedAt: new Date(),
        lastError: message
      }
    });
    throw error;
  }
}
