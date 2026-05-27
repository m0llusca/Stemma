ALTER TABLE "Workspace"
  DROP CONSTRAINT IF EXISTS "Workspace_uiTheme_chk";

ALTER TABLE "Workspace"
  ADD CONSTRAINT "Workspace_uiTheme_chk"
  CHECK ("uiTheme" IN ('graphite', 'azure', 'emerald', 'violet', 'amber', 'rose', 'ops'));
