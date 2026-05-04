ALTER TABLE "Workspace"
  ADD COLUMN "uiTheme" TEXT NOT NULL DEFAULT 'graphite';

ALTER TABLE "Workspace"
  ADD CONSTRAINT "Workspace_uiTheme_chk"
  CHECK ("uiTheme" IN ('graphite', 'azure', 'emerald', 'violet'));
