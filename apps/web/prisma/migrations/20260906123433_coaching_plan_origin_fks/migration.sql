-- AlterTable
ALTER TABLE "CoachingPlan" ADD COLUMN     "conversationId" TEXT,
ADD COLUMN     "reviewId" TEXT;

-- CreateIndex
CREATE INDEX "CoachingPlan_reviewId_idx" ON "CoachingPlan"("reviewId");

-- CreateIndex
CREATE INDEX "CoachingPlan_conversationId_idx" ON "CoachingPlan"("conversationId");

-- CreateIndex
CREATE INDEX "CoachingPlan_workspaceId_conversationId_idx" ON "CoachingPlan"("workspaceId", "conversationId");

-- AddForeignKey
ALTER TABLE "CoachingPlan" ADD CONSTRAINT "CoachingPlan_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachingPlan" ADD CONSTRAINT "CoachingPlan_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
