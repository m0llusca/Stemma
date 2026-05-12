-- Add structured sync state and progress metadata for integration engine runs.
ALTER TABLE "Integration"
  ADD COLUMN "syncStateJson" TEXT NOT NULL DEFAULT '{}';

ALTER TABLE "IntegrationRun"
  ADD COLUMN "checkedCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "skippedCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "cursorJson" TEXT NOT NULL DEFAULT '{}',
  ADD COLUMN "checkpointJson" TEXT NOT NULL DEFAULT '{}';

ALTER TABLE "IntegrationRun"
  ADD CONSTRAINT "IntegrationRun_checkedCount_nonnegative_chk"
  CHECK ("checkedCount" >= 0);

ALTER TABLE "IntegrationRun"
  ADD CONSTRAINT "IntegrationRun_skippedCount_nonnegative_chk"
  CHECK ("skippedCount" >= 0);
