-- Durable certification runs with ordered step evidence for integrations and identity providers.
CREATE TABLE "CertificationRun" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "provider" TEXT,
  "integrationId" TEXT,
  "identityProviderId" TEXT,
  "actorId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'running',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "nextActionJson" TEXT NOT NULL DEFAULT '{}',
  "summaryJson" TEXT NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CertificationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CertificationRunStep" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "stepKey" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "detail" TEXT,
  "hint" TEXT,
  "diagnosticsJson" TEXT NOT NULL DEFAULT '{}',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CertificationRunStep_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CertificationEvidence"
  ADD COLUMN "certificationRunId" TEXT;

CREATE INDEX "CertificationRun_workspaceId_targetType_source_startedAt_idx"
  ON "CertificationRun"("workspaceId", "targetType", "source", "startedAt");
CREATE INDEX "CertificationRun_workspaceId_status_startedAt_idx"
  ON "CertificationRun"("workspaceId", "status", "startedAt");
CREATE INDEX "CertificationRun_integrationId_startedAt_idx"
  ON "CertificationRun"("integrationId", "startedAt");
CREATE INDEX "CertificationRun_identityProviderId_startedAt_idx"
  ON "CertificationRun"("identityProviderId", "startedAt");
CREATE INDEX "CertificationRun_actorId_startedAt_idx"
  ON "CertificationRun"("actorId", "startedAt");
CREATE UNIQUE INDEX "CertificationRun_id_workspaceId_key"
  ON "CertificationRun"("id", "workspaceId");

CREATE UNIQUE INDEX "CertificationRunStep_runId_stepKey_key"
  ON "CertificationRunStep"("runId", "stepKey");
CREATE UNIQUE INDEX "CertificationRunStep_runId_position_key"
  ON "CertificationRunStep"("runId", "position");
CREATE INDEX "CertificationRunStep_workspaceId_runId_position_idx"
  ON "CertificationRunStep"("workspaceId", "runId", "position");
CREATE INDEX "CertificationRunStep_workspaceId_status_startedAt_idx"
  ON "CertificationRunStep"("workspaceId", "status", "startedAt");

CREATE INDEX "CertificationEvidence_certificationRunId_recordedAt_idx"
  ON "CertificationEvidence"("certificationRunId", "recordedAt");

ALTER TABLE "CertificationRun"
  ADD CONSTRAINT "CertificationRun_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CertificationRun"
  ADD CONSTRAINT "CertificationRun_integrationId_fkey"
  FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CertificationRun"
  ADD CONSTRAINT "CertificationRun_identityProviderId_fkey"
  FOREIGN KEY ("identityProviderId") REFERENCES "IdentityProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CertificationRun"
  ADD CONSTRAINT "CertificationRun_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CertificationRunStep"
  ADD CONSTRAINT "CertificationRunStep_runId_fkey"
  FOREIGN KEY ("runId", "workspaceId") REFERENCES "CertificationRun"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CertificationEvidence"
  ADD CONSTRAINT "CertificationEvidence_certificationRunId_fkey"
  FOREIGN KEY ("certificationRunId", "workspaceId") REFERENCES "CertificationRun"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;
