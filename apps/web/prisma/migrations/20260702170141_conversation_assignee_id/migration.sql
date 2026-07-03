-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "assigneeId" TEXT;

-- CreateIndex
CREATE INDEX "Conversation_workspaceId_assigneeId_idx" ON "Conversation"("workspaceId", "assigneeId");

-- Backfill assigneeId from assigneeName, but ONLY where the name resolves to
-- exactly one user in the same workspace. Ambiguous names (duplicate display
-- names) and non-matching names are left NULL so the operator scope stays
-- fail-closed rather than binding a conversation to the wrong person.
UPDATE "Conversation" c
SET "assigneeId" = u."id"
FROM "User" u
WHERE u."workspaceId" = c."workspaceId"
  AND u."name" = c."assigneeName"
  AND c."assigneeName" IS NOT NULL
  AND (
    SELECT COUNT(*) FROM "User" u2
    WHERE u2."workspaceId" = c."workspaceId" AND u2."name" = c."assigneeName"
  ) = 1;
