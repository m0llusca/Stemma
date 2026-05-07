-- DropIndex
DROP INDEX "IntegrationCredential_integrationId_key";

-- AlterTable
ALTER TABLE "IntegrationCredential" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'auth_password';
ALTER TABLE "IntegrationCredential" ADD COLUMN "fingerprint" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationCredential_integrationId_kind_key" ON "IntegrationCredential"("integrationId", "kind");

-- CreateIndex
CREATE INDEX "IntegrationCredential_workspaceId_kind_idx" ON "IntegrationCredential"("workspaceId", "kind");
