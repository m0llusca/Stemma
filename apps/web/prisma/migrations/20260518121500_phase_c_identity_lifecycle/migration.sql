-- Phase C identity lifecycle and provider-scoped policy foundations.
CREATE TYPE "UserLifecycleStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEPROVISIONED');

ALTER TABLE "User"
  ADD COLUMN "lifecycleStatus" "UserLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "sourceOfTruthProviderId" TEXT,
  ADD COLUMN "lastDirectorySyncAt" TIMESTAMP(3),
  ADD COLUMN "suspendedAt" TIMESTAMP(3),
  ADD COLUMN "deprovisionedAt" TIMESTAMP(3);

ALTER TABLE "IdentityProvider"
  ADD COLUMN "lastSyncStartedAt" TIMESTAMP(3),
  ADD COLUMN "lastSyncStatus" TEXT,
  ADD COLUMN "lastSyncError" TEXT,
  ADD COLUMN "samlEntityId" TEXT,
  ADD COLUMN "samlMetadataUrl" TEXT,
  ADD COLUMN "samlCertificateRef" TEXT,
  ADD COLUMN "ldapsUrl" TEXT,
  ADD COLUMN "ldapsBindDn" TEXT,
  ADD COLUMN "ldapsBindSecretRef" TEXT;

ALTER TABLE "ExternalIdentity"
  ADD COLUMN "externalId" TEXT,
  ADD COLUMN "lastSyncAt" TIMESTAMP(3),
  ADD COLUMN "disabledAt" TIMESTAMP(3);

CREATE TABLE "IdentityGroup" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "externalGroupId" TEXT NOT NULL,
  "externalGroupName" TEXT NOT NULL,
  "rawAttributesJson" TEXT NOT NULL DEFAULT '{}',
  "lastSyncAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "IdentityGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserIdentityGroup" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "externalGroupId" TEXT NOT NULL,
  "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSyncAt" TIMESTAMP(3),

  CONSTRAINT "UserIdentityGroup_pkey" PRIMARY KEY ("id")
);

DROP INDEX "GroupRoleMapping_workspaceId_externalGroupId_role_key";
CREATE UNIQUE INDEX "GroupRoleMapping_workspaceId_providerId_externalGroupId_role_key" ON "GroupRoleMapping"("workspaceId", "providerId", "externalGroupId", "role");
CREATE UNIQUE INDEX "GroupRoleMapping_workspaceId_externalGroupId_role_global_key" ON "GroupRoleMapping"("workspaceId", "externalGroupId", "role") WHERE "providerId" IS NULL;

CREATE INDEX "User_workspaceId_lifecycleStatus_idx" ON "User"("workspaceId", "lifecycleStatus");
CREATE INDEX "User_sourceOfTruthProviderId_lifecycleStatus_idx" ON "User"("sourceOfTruthProviderId", "lifecycleStatus");
CREATE UNIQUE INDEX "User_id_workspaceId_key" ON "User"("id", "workspaceId");
CREATE UNIQUE INDEX "IdentityProvider_id_workspaceId_key" ON "IdentityProvider"("id", "workspaceId");
CREATE UNIQUE INDEX "ExternalIdentity_providerId_externalId_key" ON "ExternalIdentity"("providerId", "externalId");
CREATE INDEX "ExternalIdentity_providerId_lastSyncAt_idx" ON "ExternalIdentity"("providerId", "lastSyncAt");
CREATE UNIQUE INDEX "IdentityGroup_providerId_externalGroupId_key" ON "IdentityGroup"("providerId", "externalGroupId");
CREATE UNIQUE INDEX "IdentityGroup_providerId_externalGroupId_workspaceId_key" ON "IdentityGroup"("providerId", "externalGroupId", "workspaceId");
CREATE INDEX "IdentityGroup_workspaceId_providerId_idx" ON "IdentityGroup"("workspaceId", "providerId");
CREATE INDEX "IdentityGroup_workspaceId_externalGroupName_idx" ON "IdentityGroup"("workspaceId", "externalGroupName");
CREATE UNIQUE INDEX "UserIdentityGroup_userId_providerId_externalGroupId_key" ON "UserIdentityGroup"("userId", "providerId", "externalGroupId");
CREATE INDEX "UserIdentityGroup_workspaceId_providerId_externalGroupId_idx" ON "UserIdentityGroup"("workspaceId", "providerId", "externalGroupId");
CREATE INDEX "UserIdentityGroup_providerId_externalGroupId_idx" ON "UserIdentityGroup"("providerId", "externalGroupId");
CREATE INDEX "GroupRoleMapping_workspaceId_providerId_isActive_priority_idx" ON "GroupRoleMapping"("workspaceId", "providerId", "isActive", "priority");

ALTER TABLE "User" ADD CONSTRAINT "User_sourceOfTruthProviderId_fkey" FOREIGN KEY ("sourceOfTruthProviderId") REFERENCES "IdentityProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IdentityGroup" ADD CONSTRAINT "IdentityGroup_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IdentityGroup" ADD CONSTRAINT "IdentityGroup_providerId_workspaceId_fkey" FOREIGN KEY ("providerId", "workspaceId") REFERENCES "IdentityProvider"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserIdentityGroup" ADD CONSTRAINT "UserIdentityGroup_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserIdentityGroup" ADD CONSTRAINT "UserIdentityGroup_userId_workspaceId_fkey" FOREIGN KEY ("userId", "workspaceId") REFERENCES "User"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserIdentityGroup" ADD CONSTRAINT "UserIdentityGroup_providerId_workspaceId_fkey" FOREIGN KEY ("providerId", "workspaceId") REFERENCES "IdentityProvider"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserIdentityGroup" ADD CONSTRAINT "UserIdentityGroup_providerId_externalGroupId_workspaceId_fkey" FOREIGN KEY ("providerId", "externalGroupId", "workspaceId") REFERENCES "IdentityGroup"("providerId", "externalGroupId", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
