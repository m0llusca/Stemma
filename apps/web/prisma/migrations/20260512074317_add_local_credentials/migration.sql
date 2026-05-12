-- CreateTable
CREATE TABLE "LocalCredential" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "passwordSalt" TEXT NOT NULL,
    "keyVersion" TEXT NOT NULL DEFAULT 'scrypt-v1',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LocalCredential_userId_key" ON "LocalCredential"("userId");

-- CreateIndex
CREATE INDEX "LocalCredential_workspaceId_idx" ON "LocalCredential"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "LocalCredential_workspaceId_login_key" ON "LocalCredential"("workspaceId", "login");

-- AddForeignKey
ALTER TABLE "LocalCredential" ADD CONSTRAINT "LocalCredential_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalCredential" ADD CONSTRAINT "LocalCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
