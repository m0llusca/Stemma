-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "samplingType" TEXT NOT NULL DEFAULT 'RANDOM';
ALTER TABLE "Conversation" ADD COLUMN "csatScore" INTEGER;
ALTER TABLE "Conversation" ADD COLUMN "csatBucket" TEXT NOT NULL DEFAULT 'NO_SCORE';
ALTER TABLE "Conversation" ADD COLUMN "supportLine" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "teamName" TEXT;

-- AlterTable
ALTER TABLE "ScorecardCriterion" ADD COLUMN "block" TEXT NOT NULL DEFAULT 'Общее';

-- AlterTable
ALTER TABLE "Review" ADD COLUMN "feedbackComment" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Review" ADD COLUMN "positiveNotes" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Review" ADD COLUMN "instructionLinks" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Review" ADD COLUMN "feedbackStatus" TEXT NOT NULL DEFAULT 'new';
ALTER TABLE "Review" ADD COLUMN "appealStatus" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "Review" ADD COLUMN "appealDueAt" DATETIME;
ALTER TABLE "Review" ADD COLUMN "appealResolvedAt" DATETIME;
ALTER TABLE "Review" ADD COLUMN "criticalError" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Review" ADD COLUMN "criticalCategory" TEXT;
ALTER TABLE "Review" ADD COLUMN "needsReanswer" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Review" ADD COLUMN "reanswerStatus" TEXT NOT NULL DEFAULT 'not_needed';
ALTER TABLE "Review" ADD COLUMN "calibrationStatus" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "Review" ADD COLUMN "calibrationNotes" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "ReviewQuota" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "assigneeName" TEXT NOT NULL,
    "supportLine" TEXT,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "plannedCount" INTEGER NOT NULL,
    "dsatTargetPercent" INTEGER NOT NULL DEFAULT 30,
    "absenceDays" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReviewQuota_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ReviewQuota_workspaceId_periodStart_periodEnd_idx" ON "ReviewQuota"("workspaceId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "ReviewQuota_workspaceId_assigneeName_idx" ON "ReviewQuota"("workspaceId", "assigneeName");
