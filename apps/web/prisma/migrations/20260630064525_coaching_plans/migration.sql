-- AlterTable
ALTER TABLE "TrainingAssignment" ADD COLUMN     "coachingPlanId" TEXT;

-- CreateTable
CREATE TABLE "CoachingPlan" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "focusArea" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoachingPlan_workspaceId_agentName_idx" ON "CoachingPlan"("workspaceId", "agentName");

-- CreateIndex
CREATE INDEX "CoachingPlan_workspaceId_status_idx" ON "CoachingPlan"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "TrainingAssignment_coachingPlanId_idx" ON "TrainingAssignment"("coachingPlanId");

-- AddForeignKey
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_coachingPlanId_fkey" FOREIGN KEY ("coachingPlanId") REFERENCES "CoachingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachingPlan" ADD CONSTRAINT "CoachingPlan_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachingPlan" ADD CONSTRAINT "CoachingPlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
