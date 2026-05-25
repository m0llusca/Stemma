-- Phase C Task 2: persistent SAML request state for InResponseTo validation and replay protection.
CREATE TABLE "SsoRequestState" (
  "key" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SsoRequestState_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "SsoRequestState_workspaceId_providerId_expiresAt_idx" ON "SsoRequestState"("workspaceId", "providerId", "expiresAt");
CREATE INDEX "SsoRequestState_providerId_consumedAt_expiresAt_idx" ON "SsoRequestState"("providerId", "consumedAt", "expiresAt");
CREATE INDEX "SsoRequestState_expiresAt_idx" ON "SsoRequestState"("expiresAt");

ALTER TABLE "SsoRequestState" ADD CONSTRAINT "SsoRequestState_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SsoRequestState" ADD CONSTRAINT "SsoRequestState_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "IdentityProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
