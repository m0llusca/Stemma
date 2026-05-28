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
