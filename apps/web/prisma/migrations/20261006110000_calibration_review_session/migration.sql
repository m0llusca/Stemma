ALTER TABLE "Review" ADD COLUMN "calibrationSessionId" TEXT;
CREATE UNIQUE INDEX "CalibrationSession_id_workspaceId_key" ON "CalibrationSession"("id", "workspaceId");
CREATE UNIQUE INDEX "Review_calibrationSessionId_conversationId_reviewerId_key" ON "Review"("calibrationSessionId", "conversationId", "reviewerId");
ALTER TABLE "Review" ADD CONSTRAINT "Review_calibrationSessionId_workspaceId_fkey"
  FOREIGN KEY ("calibrationSessionId", "workspaceId") REFERENCES "CalibrationSession"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;
