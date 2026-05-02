-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "externalSource" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "externalUrl" TEXT,
    "channel" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "assigneeName" TEXT,
    "qaStatus" TEXT NOT NULL DEFAULT 'QUEUED',
    "qaAssigneeId" TEXT,
    "qaAssigneeName" TEXT,
    "reviewDueAt" DATETIME,
    "samplingReason" TEXT NOT NULL,
    "riskHint" TEXT,
    "openedAt" DATETIME NOT NULL,
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Conversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Conversation" ("assigneeName", "channel", "closedAt", "createdAt", "customerName", "externalId", "externalSource", "externalUrl", "id", "openedAt", "riskHint", "samplingReason", "status", "subject", "tags", "updatedAt", "workspaceId") SELECT "assigneeName", "channel", "closedAt", "createdAt", "customerName", "externalId", "externalSource", "externalUrl", "id", "openedAt", "riskHint", "samplingReason", "status", "subject", "tags", "updatedAt", "workspaceId" FROM "Conversation";
DROP TABLE "Conversation";
ALTER TABLE "new_Conversation" RENAME TO "Conversation";
CREATE INDEX "Conversation_workspaceId_qaStatus_idx" ON "Conversation"("workspaceId", "qaStatus");
CREATE UNIQUE INDEX "Conversation_workspaceId_externalSource_externalId_key" ON "Conversation"("workspaceId", "externalSource", "externalId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
