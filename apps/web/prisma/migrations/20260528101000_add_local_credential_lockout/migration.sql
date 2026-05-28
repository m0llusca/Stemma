-- AlterTable
ALTER TABLE "LocalCredential" ADD COLUMN IF NOT EXISTS "failedLoginCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LocalCredential" ADD COLUMN IF NOT EXISTS "failedLoginWindowStart" TIMESTAMP(3);
ALTER TABLE "LocalCredential" ADD COLUMN IF NOT EXISTS "lastFailedLoginAt" TIMESTAMP(3);
ALTER TABLE "LocalCredential" ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3);

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
CREATE UNIQUE INDEX IF NOT EXISTS "LocalCredential_login_key" ON "LocalCredential"("login");
CREATE INDEX IF NOT EXISTS "LocalCredential_workspaceId_lockedUntil_idx" ON "LocalCredential"("workspaceId", "lockedUntil");
