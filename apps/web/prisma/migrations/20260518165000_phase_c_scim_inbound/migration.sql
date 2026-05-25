-- Phase C Task 3: SCIM inbound provisioning tokens and machine audit events.
ALTER TABLE "IdentityProvider" ADD COLUMN "scimTokenPrefix" TEXT;
ALTER TABLE "IdentityProvider" ADD COLUMN "scimTokenHash" TEXT;

CREATE UNIQUE INDEX "IdentityProvider_scimTokenHash_key" ON "IdentityProvider"("scimTokenHash");

ALTER TABLE "AuditLog" ALTER COLUMN "actorId" DROP NOT NULL;
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_actorId_fkey";
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
