-- CreateTable
CREATE TABLE "MessagingChannel" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "capabilities" TEXT NOT NULL DEFAULT 'action_notification',
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "secretRef" TEXT,
    "lastDeliveredAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessagingChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessagingDelivery" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT,
    "kind" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "recipientType" TEXT NOT NULL,
    "recipientRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "error" TEXT,
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "MessagingDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessagingChannel_workspaceId_status_idx" ON "MessagingChannel"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "MessagingChannel_workspaceId_kind_idx" ON "MessagingChannel"("workspaceId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "MessagingChannel_workspaceId_kind_key" ON "MessagingChannel"("workspaceId", "kind");

-- CreateIndex
CREATE INDEX "MessagingDelivery_workspaceId_kind_createdAt_idx" ON "MessagingDelivery"("workspaceId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "MessagingDelivery_workspaceId_status_createdAt_idx" ON "MessagingDelivery"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MessagingDelivery_channelId_createdAt_idx" ON "MessagingDelivery"("channelId", "createdAt");

-- AddForeignKey
ALTER TABLE "MessagingChannel" ADD CONSTRAINT "MessagingChannel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingDelivery" ADD CONSTRAINT "MessagingDelivery_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingDelivery" ADD CONSTRAINT "MessagingDelivery_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "MessagingChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
