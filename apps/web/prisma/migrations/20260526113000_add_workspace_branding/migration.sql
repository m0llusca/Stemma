ALTER TABLE "Workspace"
  ADD COLUMN "brandName" TEXT,
  ADD COLUMN "brandTagline" TEXT,
  ADD COLUMN "brandLogoUrl" TEXT,
  ADD COLUMN "brandLogoAlt" TEXT,
  ADD COLUMN "brandMark" TEXT,
  ADD COLUMN "brandPrimaryColor" TEXT NOT NULL DEFAULT '#3157d5',
  ADD COLUMN "brandAccentColor" TEXT NOT NULL DEFAULT '#7c97ff';

ALTER TABLE "Workspace"
  ADD CONSTRAINT "Workspace_brandPrimaryColor_chk"
  CHECK ("brandPrimaryColor" ~ '^#[0-9A-Fa-f]{6}$');

ALTER TABLE "Workspace"
  ADD CONSTRAINT "Workspace_brandAccentColor_chk"
  CHECK ("brandAccentColor" ~ '^#[0-9A-Fa-f]{6}$');
