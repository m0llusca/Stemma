-- CreateTable
CREATE TABLE "Locale" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Locale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranslationKey" (
    "id" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "defaultText" TEXT NOT NULL,
    "description" TEXT,
    "ownerArea" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranslationKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranslationValue" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "localeId" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "draftText" TEXT,
    "publishedText" TEXT,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranslationValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranslationAudit" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "localeId" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "beforeText" TEXT,
    "afterText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranslationAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Locale_workspaceId_isEnabled_idx" ON "Locale"("workspaceId", "isEnabled");

-- CreateIndex
CREATE INDEX "Locale_workspaceId_isDefault_idx" ON "Locale"("workspaceId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "Locale_workspaceId_code_key" ON "Locale"("workspaceId", "code");

-- CreateIndex
CREATE INDEX "TranslationKey_namespace_idx" ON "TranslationKey"("namespace");

-- CreateIndex
CREATE INDEX "TranslationKey_ownerArea_idx" ON "TranslationKey"("ownerArea");

-- CreateIndex
CREATE UNIQUE INDEX "TranslationKey_namespace_key_key" ON "TranslationKey"("namespace", "key");

-- CreateIndex
CREATE INDEX "TranslationValue_workspaceId_localeId_idx" ON "TranslationValue"("workspaceId", "localeId");

-- CreateIndex
CREATE INDEX "TranslationValue_workspaceId_keyId_idx" ON "TranslationValue"("workspaceId", "keyId");

-- CreateIndex
CREATE INDEX "TranslationValue_publishedById_idx" ON "TranslationValue"("publishedById");

-- CreateIndex
CREATE UNIQUE INDEX "TranslationValue_workspaceId_localeId_keyId_key" ON "TranslationValue"("workspaceId", "localeId", "keyId");

-- CreateIndex
CREATE INDEX "TranslationAudit_workspaceId_localeId_keyId_createdAt_idx" ON "TranslationAudit"("workspaceId", "localeId", "keyId", "createdAt");

-- CreateIndex
CREATE INDEX "TranslationAudit_workspaceId_action_createdAt_idx" ON "TranslationAudit"("workspaceId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "TranslationAudit_actorId_idx" ON "TranslationAudit"("actorId");

-- AddForeignKey
ALTER TABLE "Locale" ADD CONSTRAINT "Locale_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationValue" ADD CONSTRAINT "TranslationValue_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationValue" ADD CONSTRAINT "TranslationValue_localeId_fkey" FOREIGN KEY ("localeId") REFERENCES "Locale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationValue" ADD CONSTRAINT "TranslationValue_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "TranslationKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationValue" ADD CONSTRAINT "TranslationValue_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationAudit" ADD CONSTRAINT "TranslationAudit_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationAudit" ADD CONSTRAINT "TranslationAudit_localeId_fkey" FOREIGN KEY ("localeId") REFERENCES "Locale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationAudit" ADD CONSTRAINT "TranslationAudit_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "TranslationKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranslationAudit" ADD CONSTRAINT "TranslationAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
