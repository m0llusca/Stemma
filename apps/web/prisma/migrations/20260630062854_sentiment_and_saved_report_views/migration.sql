-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "sentiment" TEXT,
ADD COLUMN     "sentimentModel" TEXT,
ADD COLUMN     "sentimentScore" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "SavedReportView" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'private',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedReportView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedReportView_workspaceId_userId_idx" ON "SavedReportView"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "SavedReportView_workspaceId_scope_order_idx" ON "SavedReportView"("workspaceId", "scope", "order");

-- AddForeignKey
ALTER TABLE "SavedReportView" ADD CONSTRAINT "SavedReportView_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedReportView" ADD CONSTRAINT "SavedReportView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
