-- Phase D: durable live-certification evidence ledger for integrations and identity providers.
CREATE TABLE "CertificationEvidence" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "provider" TEXT,
  "integrationId" TEXT,
  "identityProviderId" TEXT,
  "runId" TEXT NOT NULL,
  "actorId" TEXT,
  "envGate" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "redactedDiagnosticsJson" TEXT NOT NULL DEFAULT '{}',
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CertificationEvidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CertificationEvidence_workspaceId_targetType_source_recordedAt_idx"
  ON "CertificationEvidence"("workspaceId", "targetType", "source", "recordedAt");
CREATE INDEX "CertificationEvidence_workspaceId_result_recordedAt_idx"
  ON "CertificationEvidence"("workspaceId", "result", "recordedAt");
CREATE INDEX "CertificationEvidence_integrationId_recordedAt_idx"
  ON "CertificationEvidence"("integrationId", "recordedAt");
CREATE INDEX "CertificationEvidence_identityProviderId_recordedAt_idx"
  ON "CertificationEvidence"("identityProviderId", "recordedAt");
CREATE INDEX "CertificationEvidence_actorId_recordedAt_idx"
  ON "CertificationEvidence"("actorId", "recordedAt");

ALTER TABLE "CertificationEvidence"
  ADD CONSTRAINT "CertificationEvidence_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CertificationEvidence"
  ADD CONSTRAINT "CertificationEvidence_integrationId_fkey"
  FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CertificationEvidence"
  ADD CONSTRAINT "CertificationEvidence_identityProviderId_fkey"
  FOREIGN KEY ("identityProviderId") REFERENCES "IdentityProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CertificationEvidence"
  ADD CONSTRAINT "CertificationEvidence_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
