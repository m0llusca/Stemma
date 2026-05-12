-- Add inbound webhook ingest foundation for connector bridge integrations.
ALTER TYPE "BackendJobType" ADD VALUE 'WEBHOOK_INGEST';

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "integrationId" TEXT,
    "source" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "acceptedEvents" TEXT NOT NULL DEFAULT 'conversation.upsert',
    "secretPrefix" TEXT NOT NULL,
    "encryptedSecret" TEXT NOT NULL,
    "signingAlgorithm" TEXT NOT NULL DEFAULT 'hmac_sha256',
    "lastReceivedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookIngestEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "integrationRunId" TEXT,
    "conversationId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "requestHash" TEXT NOT NULL,
    "signatureVerified" BOOLEAN NOT NULL DEFAULT false,
    "payloadJson" TEXT NOT NULL,
    "errorMessage" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookIngestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebhookEndpoint_workspaceId_status_idx" ON "WebhookEndpoint"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_workspaceId_source_idx" ON "WebhookEndpoint"("workspaceId", "source");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_workspaceId_integrationId_idx" ON "WebhookEndpoint"("workspaceId", "integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookIngestEvent_endpointId_idempotencyKey_key" ON "WebhookIngestEvent"("endpointId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "WebhookIngestEvent_workspaceId_status_receivedAt_idx" ON "WebhookIngestEvent"("workspaceId", "status", "receivedAt");

-- CreateIndex
CREATE INDEX "WebhookIngestEvent_workspaceId_source_receivedAt_idx" ON "WebhookIngestEvent"("workspaceId", "source", "receivedAt");

-- CreateIndex
CREATE INDEX "WebhookIngestEvent_integrationRunId_idx" ON "WebhookIngestEvent"("integrationRunId");

-- CreateIndex
CREATE INDEX "WebhookIngestEvent_conversationId_idx" ON "WebhookIngestEvent"("conversationId");

-- AddCheckConstraint
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_status_chk" CHECK ("status" IN ('active', 'disabled'));

-- AddCheckConstraint
ALTER TABLE "WebhookIngestEvent" ADD CONSTRAINT "WebhookIngestEvent_status_chk" CHECK ("status" IN ('received', 'processed', 'duplicate', 'failed'));

-- AddCheckConstraint
ALTER TABLE "WebhookIngestEvent" ADD CONSTRAINT "WebhookIngestEvent_processedAt_after_receivedAt_chk" CHECK ("processedAt" IS NULL OR "processedAt" >= "receivedAt");

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookIngestEvent" ADD CONSTRAINT "WebhookIngestEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookIngestEvent" ADD CONSTRAINT "WebhookIngestEvent_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookIngestEvent" ADD CONSTRAINT "WebhookIngestEvent_integrationRunId_fkey" FOREIGN KEY ("integrationRunId") REFERENCES "IntegrationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookIngestEvent" ADD CONSTRAINT "WebhookIngestEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
