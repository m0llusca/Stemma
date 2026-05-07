-- CreateTable
CREATE TABLE "IntegrationDiagnosticRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "actorId" TEXT,
    "status" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "summaryJson" TEXT NOT NULL DEFAULT '{}',
    "redactedEndpoint" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,

    CONSTRAINT "IntegrationDiagnosticRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationDiagnosticStep" (
    "id" TEXT NOT NULL,
    "diagnosticRunId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "detailJson" TEXT NOT NULL DEFAULT '{}',
    "remediationHint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationDiagnosticStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationRunItem" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "integrationRunId" TEXT,
    "diagnosticRunId" TEXT,
    "externalId" TEXT NOT NULL,
    "ticketNumber" TEXT,
    "status" TEXT NOT NULL,
    "articleCount" INTEGER NOT NULL DEFAULT 0,
    "privateArticleCount" INTEGER NOT NULL DEFAULT 0,
    "attachmentCount" INTEGER NOT NULL DEFAULT 0,
    "warningsJson" TEXT NOT NULL DEFAULT '[]',
    "errorsJson" TEXT NOT NULL DEFAULT '[]',
    "conversationId" TEXT,
    "normalizedPreviewJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationRunItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationDiagnosticRun_workspaceId_startedAt_idx" ON "IntegrationDiagnosticRun"("workspaceId", "startedAt");

-- CreateIndex
CREATE INDEX "IntegrationDiagnosticRun_workspaceId_status_startedAt_idx" ON "IntegrationDiagnosticRun"("workspaceId", "status", "startedAt");

-- CreateIndex
CREATE INDEX "IntegrationDiagnosticRun_integrationId_startedAt_idx" ON "IntegrationDiagnosticRun"("integrationId", "startedAt");

-- CreateIndex
CREATE INDEX "IntegrationDiagnosticStep_diagnosticRunId_createdAt_idx" ON "IntegrationDiagnosticStep"("diagnosticRunId", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationDiagnosticStep_diagnosticRunId_key_idx" ON "IntegrationDiagnosticStep"("diagnosticRunId", "key");

-- CreateIndex
CREATE INDEX "IntegrationRunItem_workspaceId_createdAt_idx" ON "IntegrationRunItem"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationRunItem_workspaceId_status_createdAt_idx" ON "IntegrationRunItem"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationRunItem_integrationRunId_status_idx" ON "IntegrationRunItem"("integrationRunId", "status");

-- CreateIndex
CREATE INDEX "IntegrationRunItem_diagnosticRunId_status_idx" ON "IntegrationRunItem"("diagnosticRunId", "status");

-- CreateIndex
CREATE INDEX "IntegrationRunItem_conversationId_idx" ON "IntegrationRunItem"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationRunItem_integrationRunId_externalId_key"
ON "IntegrationRunItem"("integrationRunId", "externalId")
WHERE "integrationRunId" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "IntegrationDiagnosticRun" ADD CONSTRAINT "IntegrationDiagnosticRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationDiagnosticRun" ADD CONSTRAINT "IntegrationDiagnosticRun_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationDiagnosticRun" ADD CONSTRAINT "IntegrationDiagnosticRun_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationDiagnosticStep" ADD CONSTRAINT "IntegrationDiagnosticStep_diagnosticRunId_fkey" FOREIGN KEY ("diagnosticRunId") REFERENCES "IntegrationDiagnosticRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationRunItem" ADD CONSTRAINT "IntegrationRunItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationRunItem" ADD CONSTRAINT "IntegrationRunItem_integrationRunId_fkey" FOREIGN KEY ("integrationRunId") REFERENCES "IntegrationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationRunItem" ADD CONSTRAINT "IntegrationRunItem_diagnosticRunId_fkey" FOREIGN KEY ("diagnosticRunId") REFERENCES "IntegrationDiagnosticRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationRunItem" ADD CONSTRAINT "IntegrationRunItem_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
