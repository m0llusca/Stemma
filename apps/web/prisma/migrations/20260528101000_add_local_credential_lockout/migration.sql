-- AlterTable
ALTER TABLE "LocalCredential" ADD COLUMN "failedLoginCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LocalCredential" ADD COLUMN "failedLoginWindowStart" TIMESTAMP(3);
ALTER TABLE "LocalCredential" ADD COLUMN "lastFailedLoginAt" TIMESTAMP(3);
ALTER TABLE "LocalCredential" ADD COLUMN "lockedUntil" TIMESTAMP(3);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "LocalCredential"
    GROUP BY "login"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add global unique LocalCredential.login index while duplicate logins exist. Rename or merge duplicate local logins before applying this migration.';
  END IF;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX "LocalCredential_login_key" ON "LocalCredential"("login");
CREATE INDEX "LocalCredential_workspaceId_lockedUntil_idx" ON "LocalCredential"("workspaceId", "lockedUntil");
