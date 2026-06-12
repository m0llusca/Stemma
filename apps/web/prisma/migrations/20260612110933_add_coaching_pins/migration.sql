-- CreateTable
CREATE TABLE "CoachingPin" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachingPin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoachingPin_workspaceId_conversationId_idx" ON "CoachingPin"("workspaceId", "conversationId");

-- CreateIndex
CREATE INDEX "CoachingPin_messageId_idx" ON "CoachingPin"("messageId");

-- AddForeignKey
ALTER TABLE "CoachingPin" ADD CONSTRAINT "CoachingPin_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachingPin" ADD CONSTRAINT "CoachingPin_conversationId_workspaceId_fkey" FOREIGN KEY ("conversationId", "workspaceId") REFERENCES "Conversation"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachingPin" ADD CONSTRAINT "CoachingPin_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachingPin" ADD CONSTRAINT "CoachingPin_authorId_workspaceId_fkey" FOREIGN KEY ("authorId", "workspaceId") REFERENCES "User"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;
