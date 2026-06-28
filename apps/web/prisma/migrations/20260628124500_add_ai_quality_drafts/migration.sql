-- CreateTable
CREATE TABLE "AiQualityDraft" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "conversationId" TEXT,
    "reviewId" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "modelVersion" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "suggestedValueJson" TEXT NOT NULL DEFAULT '{}',
    "evidenceRefsJson" TEXT NOT NULL DEFAULT '[]',
    "finalizedById" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiQualityDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiQualityDraft_workspaceId_conversationId_createdAt_idx" ON "AiQualityDraft"("workspaceId", "conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "AiQualityDraft_workspaceId_status_createdAt_idx" ON "AiQualityDraft"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AiQualityDraft_finalizedById_finalizedAt_idx" ON "AiQualityDraft"("finalizedById", "finalizedAt");

-- AddForeignKey
ALTER TABLE "AiQualityDraft" ADD CONSTRAINT "AiQualityDraft_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiQualityDraft" ADD CONSTRAINT "AiQualityDraft_conversationId_workspaceId_fkey" FOREIGN KEY ("conversationId", "workspaceId") REFERENCES "Conversation"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiQualityDraft" ADD CONSTRAINT "AiQualityDraft_finalizedById_workspaceId_fkey" FOREIGN KEY ("finalizedById", "workspaceId") REFERENCES "User"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;
