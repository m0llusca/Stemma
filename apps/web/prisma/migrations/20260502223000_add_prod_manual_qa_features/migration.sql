-- AlterTable
ALTER TABLE "User" ADD COLUMN "supportLine" TEXT;
ALTER TABLE "User" ADD COLUMN "teamName" TEXT;

-- AlterTable
ALTER TABLE "Integration" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'custom_api';
ALTER TABLE "Integration" ADD COLUMN "baseUrl" TEXT;
ALTER TABLE "Integration" ADD COLUMN "configJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "Integration" ADD COLUMN "authMode" TEXT NOT NULL DEFAULT 'token';
ALTER TABLE "Integration" ADD COLUMN "importLimit" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "Integration" ADD COLUMN "batchSize" INTEGER NOT NULL DEFAULT 25;
ALTER TABLE "Integration" ADD COLUMN "dateRangeDays" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "Integration" ADD COLUMN "schedule" TEXT;
ALTER TABLE "Integration" ADD COLUMN "lastDryRunAt" DATETIME;
ALTER TABLE "Integration" ADD COLUMN "lastImportAt" DATETIME;
ALTER TABLE "Integration" ADD COLUMN "lastError" TEXT;

-- AlterTable
ALTER TABLE "Review" ADD COLUMN "feedbackAckAt" DATETIME;
ALTER TABLE "Review" ADD COLUMN "feedbackAckBy" TEXT;
ALTER TABLE "Review" ADD COLUMN "selfReviewNotes" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "SavedQueueView" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT,
  "name" TEXT NOT NULL,
  "href" TEXT NOT NULL,
  "scope" TEXT NOT NULL DEFAULT 'private',
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "SavedQueueView_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SavedQueueView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CalibrationSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "scorecardId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "dueAt" DATETIME,
  "notes" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "CalibrationSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CalibrationSession_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CalibrationSession_scorecardId_fkey" FOREIGN KEY ("scorecardId") REFERENCES "Scorecard" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CalibrationSessionItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "baselineReviewId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CalibrationSessionItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CalibrationSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CalibrationSessionItem_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CalibrationParticipant" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'assigned',
  "completedAt" DATETIME,
  "notes" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "CalibrationParticipant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CalibrationSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CalibrationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReviewFeedbackEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "reviewId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "comment" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReviewFeedbackEvent_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReviewFeedbackEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IntegrationRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "integrationId" TEXT,
  "actorId" TEXT,
  "source" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "dryRun" BOOLEAN NOT NULL DEFAULT true,
  "requestedLimit" INTEGER NOT NULL DEFAULT 100,
  "importedCount" INTEGER NOT NULL DEFAULT 0,
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" DATETIME,
  CONSTRAINT "IntegrationRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "IntegrationRun_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "IntegrationRun_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SamplingRule" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "conditionsJson" TEXT NOT NULL DEFAULT '{}',
  "targetPercent" INTEGER NOT NULL DEFAULT 10,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "SamplingRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityKnowledgeEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "recommendation" TEXT NOT NULL,
  "riskLevel" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "QualityKnowledgeEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TrainingAssignment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "reviewId" TEXT,
  "assigneeId" TEXT,
  "assignedById" TEXT,
  "assigneeName" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "dueAt" DATETIME,
  "status" TEXT NOT NULL DEFAULT 'open',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "TrainingAssignment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TrainingAssignment_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "TrainingAssignment_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "TrainingAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Integration_workspaceId_source_key" ON "Integration"("workspaceId", "source");
CREATE INDEX "SavedQueueView_workspaceId_userId_idx" ON "SavedQueueView"("workspaceId", "userId");
CREATE INDEX "CalibrationSession_workspaceId_status_idx" ON "CalibrationSession"("workspaceId", "status");
CREATE UNIQUE INDEX "CalibrationSessionItem_sessionId_conversationId_key" ON "CalibrationSessionItem"("sessionId", "conversationId");
CREATE UNIQUE INDEX "CalibrationParticipant_sessionId_userId_key" ON "CalibrationParticipant"("sessionId", "userId");
CREATE INDEX "ReviewFeedbackEvent_reviewId_createdAt_idx" ON "ReviewFeedbackEvent"("reviewId", "createdAt");
CREATE INDEX "IntegrationRun_workspaceId_startedAt_idx" ON "IntegrationRun"("workspaceId", "startedAt");
CREATE INDEX "IntegrationRun_workspaceId_source_idx" ON "IntegrationRun"("workspaceId", "source");
CREATE INDEX "SamplingRule_workspaceId_isActive_idx" ON "SamplingRule"("workspaceId", "isActive");
CREATE INDEX "QualityKnowledgeEntry_workspaceId_category_idx" ON "QualityKnowledgeEntry"("workspaceId", "category");
CREATE INDEX "TrainingAssignment_workspaceId_status_idx" ON "TrainingAssignment"("workspaceId", "status");
CREATE INDEX "TrainingAssignment_workspaceId_assigneeName_idx" ON "TrainingAssignment"("workspaceId", "assigneeName");
