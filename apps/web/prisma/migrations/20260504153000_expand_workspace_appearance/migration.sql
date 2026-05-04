ALTER TABLE "Workspace"
  ADD COLUMN "uiDensity" TEXT NOT NULL DEFAULT 'comfortable',
  ADD COLUMN "uiCorners" TEXT NOT NULL DEFAULT 'medium',
  ADD COLUMN "uiContrast" TEXT NOT NULL DEFAULT 'standard';

ALTER TABLE "Workspace"
  DROP CONSTRAINT IF EXISTS "Workspace_uiTheme_chk";

ALTER TABLE "Workspace"
  ADD CONSTRAINT "Workspace_uiTheme_chk"
  CHECK ("uiTheme" IN ('graphite', 'azure', 'emerald', 'violet', 'amber', 'rose'));

ALTER TABLE "Workspace"
  ADD CONSTRAINT "Workspace_uiDensity_chk"
  CHECK ("uiDensity" IN ('compact', 'comfortable', 'spacious'));

ALTER TABLE "Workspace"
  ADD CONSTRAINT "Workspace_uiCorners_chk"
  CHECK ("uiCorners" IN ('sharp', 'medium', 'soft'));

ALTER TABLE "Workspace"
  ADD CONSTRAINT "Workspace_uiContrast_chk"
  CHECK ("uiContrast" IN ('standard', 'high'));
