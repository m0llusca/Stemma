-- AlterEnum
ALTER TYPE "BackendJobType" ADD VALUE 'AI_SCORE';

-- AlterTable
ALTER TABLE "AiQualityDraft" ADD COLUMN     "confidence" DOUBLE PRECISION;

-- RenameForeignKey
ALTER TABLE "CertificationEvidence" RENAME CONSTRAINT "CertificationEvidence_certificationRunId_fkey" TO "CertificationEvidence_certificationRunId_workspaceId_fkey";

-- RenameForeignKey
ALTER TABLE "CertificationRun" RENAME CONSTRAINT "CertificationRun_actorId_fkey" TO "CertificationRun_actorId_workspaceId_fkey";

-- RenameForeignKey
ALTER TABLE "CertificationRun" RENAME CONSTRAINT "CertificationRun_identityProviderId_fkey" TO "CertificationRun_identityProviderId_workspaceId_fkey";

-- RenameForeignKey
ALTER TABLE "CertificationRun" RENAME CONSTRAINT "CertificationRun_integrationId_fkey" TO "CertificationRun_integrationId_workspaceId_fkey";

-- RenameForeignKey
ALTER TABLE "CertificationRunStep" RENAME CONSTRAINT "CertificationRunStep_runId_fkey" TO "CertificationRunStep_runId_workspaceId_fkey";
