ALTER TABLE "LocalCredential"
  ADD COLUMN "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "failedLoginWindowStart" TIMESTAMP(3),
  ADD COLUMN "lastFailedLoginAt" TIMESTAMP(3),
  ADD COLUMN "lockedUntil" TIMESTAMP(3);

CREATE INDEX "LocalCredential_workspaceId_lockedUntil_idx" ON "LocalCredential"("workspaceId", "lockedUntil");

CREATE UNIQUE INDEX "Conversation_id_workspaceId_key" ON "Conversation"("id", "workspaceId");
CREATE UNIQUE INDEX "Scorecard_id_workspaceId_key" ON "Scorecard"("id", "workspaceId");

ALTER TABLE "Review" DROP CONSTRAINT "Review_conversationId_fkey";
ALTER TABLE "Review" DROP CONSTRAINT "Review_reviewerId_fkey";
ALTER TABLE "Review" DROP CONSTRAINT "Review_scorecardId_fkey";

ALTER TABLE "Review"
  ADD CONSTRAINT "Review_conversationId_workspaceId_fkey"
  FOREIGN KEY ("conversationId", "workspaceId") REFERENCES "Conversation"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Review"
  ADD CONSTRAINT "Review_reviewerId_workspaceId_fkey"
  FOREIGN KEY ("reviewerId", "workspaceId") REFERENCES "User"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Review"
  ADD CONSTRAINT "Review_scorecardId_workspaceId_fkey"
  FOREIGN KEY ("scorecardId", "workspaceId") REFERENCES "Scorecard"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;
