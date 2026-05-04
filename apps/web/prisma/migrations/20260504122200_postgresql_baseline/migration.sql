-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('ADMIN', 'TEAM_LEAD', 'QA_ANALYST', 'SUPPORT_AGENT', 'VIEWER');

-- CreateEnum
CREATE TYPE "QaStatus" AS ENUM ('QUEUED', 'ASSIGNED', 'IN_PROGRESS', 'FINALIZED', 'REOPENED');

-- CreateEnum
CREATE TYPE "ConversationChannel" AS ENUM ('CHAT', 'EMAIL', 'TICKET', 'MESSENGER');

-- CreateEnum
CREATE TYPE "ParticipantType" AS ENUM ('CUSTOMER', 'HUMAN_AGENT', 'AI_AGENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ReviewSource" AS ENUM ('HUMAN', 'AI', 'CALIBRATION', 'SELF_REVIEW');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('DRAFT', 'FINALIZED');

-- CreateEnum
CREATE TYPE "CriterionKind" AS ENUM ('SCALE_1_3', 'PASS_FAIL');

-- CreateEnum
CREATE TYPE "FindingOwnerType" AS ENUM ('AGENT', 'PROCESS', 'PRODUCT', 'POLICY', 'AI_SYSTEM');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IdentityProviderType" AS ENUM ('DEMO', 'MICROSOFT_ENTRA_ID', 'ACTIVE_DIRECTORY_LDAPS', 'OIDC', 'SAML');

-- CreateEnum
CREATE TYPE "AuthSessionStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BackendJobType" AS ENUM ('INTEGRATION_IMPORT', 'REPORT_EXPORT', 'DIRECTORY_SYNC', 'RETENTION_CLEANUP');

-- CreateEnum
CREATE TYPE "BackendJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "IdempotencyStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReportSnapshotStatus" AS ENUM ('QUEUED', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "RoleName" NOT NULL,
    "supportLine" TEXT,
    "teamName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdentityProvider" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" "IdentityProviderType" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "issuer" TEXT,
    "tenantId" TEXT,
    "clientId" TEXT,
    "clientSecretRef" TEXT,
    "authorizationUrl" TEXT,
    "tokenUrl" TEXT,
    "jwksUrl" TEXT,
    "scopes" TEXT NOT NULL DEFAULT 'openid profile email',
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdentityProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerSubject" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "rawClaimsJson" TEXT NOT NULL DEFAULT '{}',
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "ExternalIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupRoleMapping" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "providerId" TEXT,
    "externalGroupId" TEXT NOT NULL,
    "externalGroupName" TEXT NOT NULL,
    "role" "RoleName" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupRoleMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT,
    "sessionTokenHash" TEXT NOT NULL,
    "status" "AuthSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "ipHash" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'custom_api',
    "status" TEXT NOT NULL,
    "baseUrl" TEXT,
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "authMode" TEXT NOT NULL DEFAULT 'token',
    "importLimit" INTEGER NOT NULL DEFAULT 100,
    "batchSize" INTEGER NOT NULL DEFAULT 25,
    "dateRangeDays" INTEGER NOT NULL DEFAULT 30,
    "schedule" TEXT,
    "syncCursor" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "lastDryRunAt" TIMESTAMP(3),
    "lastImportAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationCredential" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "authMode" TEXT NOT NULL,
    "encryptedSecret" TEXT NOT NULL,
    "keyVersion" TEXT NOT NULL DEFAULT 'local-dev',
    "lastRotatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiToken" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastError" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiRateLimit" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "apiTokenId" TEXT NOT NULL,
    "routeKey" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiRateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "externalSource" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "externalUrl" TEXT,
    "channel" "ConversationChannel" NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "assigneeName" TEXT,
    "qaStatus" "QaStatus" NOT NULL DEFAULT 'QUEUED',
    "qaAssigneeId" TEXT,
    "qaAssigneeName" TEXT,
    "reviewDueAt" TIMESTAMP(3),
    "samplingReason" TEXT NOT NULL,
    "samplingType" TEXT NOT NULL DEFAULT 'RANDOM',
    "csatScore" INTEGER,
    "csatBucket" TEXT NOT NULL DEFAULT 'NO_SCORE',
    "supportLine" TEXT,
    "teamName" TEXT,
    "riskHint" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "participantType" "ParticipantType" NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scorecard" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scorecard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScorecardCriterion" (
    "id" TEXT NOT NULL,
    "scorecardId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "block" TEXT NOT NULL DEFAULT 'Общее',
    "kind" "CriterionKind" NOT NULL,
    "weight" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL,

    CONSTRAINT "ScorecardCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "scorecardId" TEXT NOT NULL,
    "reviewSource" "ReviewSource" NOT NULL,
    "rubricVersion" INTEGER NOT NULL,
    "status" "ReviewStatus" NOT NULL,
    "totalScore" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION,
    "summary" TEXT NOT NULL,
    "feedbackComment" TEXT NOT NULL DEFAULT '',
    "positiveNotes" TEXT NOT NULL DEFAULT '',
    "instructionLinks" TEXT NOT NULL DEFAULT '',
    "feedbackStatus" TEXT NOT NULL DEFAULT 'new',
    "feedbackAckAt" TIMESTAMP(3),
    "feedbackAckBy" TEXT,
    "appealStatus" TEXT NOT NULL DEFAULT 'none',
    "appealDueAt" TIMESTAMP(3),
    "appealResolvedAt" TIMESTAMP(3),
    "criticalError" BOOLEAN NOT NULL DEFAULT false,
    "criticalCategory" TEXT,
    "needsReanswer" BOOLEAN NOT NULL DEFAULT false,
    "reanswerStatus" TEXT NOT NULL DEFAULT 'not_needed',
    "calibrationStatus" TEXT NOT NULL DEFAULT 'none',
    "calibrationNotes" TEXT NOT NULL DEFAULT '',
    "selfReviewNotes" TEXT NOT NULL DEFAULT '',
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "reviewId" TEXT,
    "conversationId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CriterionScore" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "value" INTEGER,
    "passed" BOOLEAN,
    "isNotApplicable" BOOLEAN NOT NULL DEFAULT false,
    "comment" TEXT NOT NULL,
    "evidenceMessageId" TEXT,

    CONSTRAINT "CriterionScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "ownerType" "FindingOwnerType" NOT NULL,
    "category" TEXT NOT NULL,
    "rootCause" TEXT NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL,
    "evidenceSummary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachingAction" (
    "id" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "assignee" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachingAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewQuota" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "assigneeName" TEXT NOT NULL,
    "supportLine" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "plannedCount" INTEGER NOT NULL,
    "dsatTargetPercent" INTEGER NOT NULL DEFAULT 30,
    "absenceDays" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewQuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedQueueView" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'private',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedQueueView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalibrationSession" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "scorecardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "dueAt" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalibrationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalibrationSessionItem" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "baselineReviewId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalibrationSessionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalibrationParticipant" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'assigned',
    "completedAt" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalibrationParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewFeedbackEvent" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewFeedbackEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "integrationId" TEXT,
    "actorId" TEXT,
    "source" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "requestedLimit" INTEGER NOT NULL DEFAULT 100,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "IntegrationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackendJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" "BackendJobType" NOT NULL,
    "status" "BackendJobStatus" NOT NULL DEFAULT 'QUEUED',
    "queueName" TEXT NOT NULL DEFAULT 'default',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "resultJson" TEXT NOT NULL DEFAULT '{}',
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackendJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackendJobEvent" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackendJobEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER,
    "responseBodyJson" TEXT,
    "status" "IdempotencyStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SamplingRule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "conditionsJson" TEXT NOT NULL DEFAULT '{}',
    "targetPercent" INTEGER NOT NULL DEFAULT 10,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SamplingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityKnowledgeEntry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QualityKnowledgeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingAssignment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "reviewId" TEXT,
    "assigneeId" TEXT,
    "assignedById" TEXT,
    "assigneeName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "filtersJson" TEXT NOT NULL DEFAULT '{}',
    "metricsJson" TEXT NOT NULL DEFAULT '{}',
    "exportFormat" TEXT,
    "status" "ReportSnapshotStatus" NOT NULL DEFAULT 'READY',
    "filePath" TEXT,
    "fileSize" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "metadata" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "User_workspaceId_role_name_idx" ON "User"("workspaceId", "role", "name");

-- CreateIndex
CREATE UNIQUE INDEX "User_workspaceId_email_key" ON "User"("workspaceId", "email");

-- CreateIndex
CREATE INDEX "IdentityProvider_workspaceId_type_idx" ON "IdentityProvider"("workspaceId", "type");

-- CreateIndex
CREATE INDEX "IdentityProvider_workspaceId_status_idx" ON "IdentityProvider"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "IdentityProvider_workspaceId_slug_key" ON "IdentityProvider"("workspaceId", "slug");

-- CreateIndex
CREATE INDEX "ExternalIdentity_userId_idx" ON "ExternalIdentity"("userId");

-- CreateIndex
CREATE INDEX "ExternalIdentity_providerId_email_idx" ON "ExternalIdentity"("providerId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdentity_providerId_providerSubject_key" ON "ExternalIdentity"("providerId", "providerSubject");

-- CreateIndex
CREATE INDEX "GroupRoleMapping_workspaceId_isActive_idx" ON "GroupRoleMapping"("workspaceId", "isActive");

-- CreateIndex
CREATE INDEX "GroupRoleMapping_providerId_isActive_idx" ON "GroupRoleMapping"("providerId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "GroupRoleMapping_workspaceId_externalGroupId_role_key" ON "GroupRoleMapping"("workspaceId", "externalGroupId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_sessionTokenHash_key" ON "AuthSession"("sessionTokenHash");

-- CreateIndex
CREATE INDEX "AuthSession_workspaceId_userId_idx" ON "AuthSession"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "AuthSession_workspaceId_status_expiresAt_idx" ON "AuthSession"("workspaceId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "AuthSession_status_expiresAt_idx" ON "AuthSession"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Integration_workspaceId_status_idx" ON "Integration"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Integration_workspaceId_updatedAt_idx" ON "Integration"("workspaceId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_workspaceId_source_key" ON "Integration"("workspaceId", "source");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationCredential_integrationId_key" ON "IntegrationCredential"("integrationId");

-- CreateIndex
CREATE INDEX "IntegrationCredential_workspaceId_idx" ON "IntegrationCredential"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiToken_tokenHash_key" ON "ApiToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ApiToken_workspaceId_idx" ON "ApiToken"("workspaceId");

-- CreateIndex
CREATE INDEX "ApiToken_workspaceId_updatedAt_idx" ON "ApiToken"("workspaceId", "updatedAt");

-- CreateIndex
CREATE INDEX "ApiRateLimit_workspaceId_windowStart_idx" ON "ApiRateLimit"("workspaceId", "windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "ApiRateLimit_apiTokenId_routeKey_windowStart_key" ON "ApiRateLimit"("apiTokenId", "routeKey", "windowStart");

-- CreateIndex
CREATE INDEX "Conversation_workspaceId_qaStatus_idx" ON "Conversation"("workspaceId", "qaStatus");

-- CreateIndex
CREATE INDEX "Conversation_workspaceId_openedAt_idx" ON "Conversation"("workspaceId", "openedAt");

-- CreateIndex
CREATE INDEX "Conversation_workspaceId_updatedAt_idx" ON "Conversation"("workspaceId", "updatedAt");

-- CreateIndex
CREATE INDEX "Conversation_workspaceId_reviewDueAt_idx" ON "Conversation"("workspaceId", "reviewDueAt");

-- CreateIndex
CREATE INDEX "Conversation_workspaceId_externalSource_idx" ON "Conversation"("workspaceId", "externalSource");

-- CreateIndex
CREATE INDEX "Conversation_workspaceId_assigneeName_idx" ON "Conversation"("workspaceId", "assigneeName");

-- CreateIndex
CREATE INDEX "Conversation_workspaceId_qaAssigneeName_idx" ON "Conversation"("workspaceId", "qaAssigneeName");

-- CreateIndex
CREATE INDEX "Conversation_workspaceId_samplingType_idx" ON "Conversation"("workspaceId", "samplingType");

-- CreateIndex
CREATE INDEX "Conversation_workspaceId_csatBucket_idx" ON "Conversation"("workspaceId", "csatBucket");

-- CreateIndex
CREATE INDEX "Conversation_workspaceId_supportLine_idx" ON "Conversation"("workspaceId", "supportLine");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_workspaceId_externalSource_externalId_key" ON "Conversation"("workspaceId", "externalSource", "externalId");

-- CreateIndex
CREATE INDEX "Message_conversationId_sentAt_idx" ON "Message"("conversationId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "Message_conversationId_externalId_key" ON "Message"("conversationId", "externalId");

-- CreateIndex
CREATE INDEX "Scorecard_workspaceId_isActive_idx" ON "Scorecard"("workspaceId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Scorecard_workspaceId_version_key" ON "Scorecard"("workspaceId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ScorecardCriterion_scorecardId_key_key" ON "ScorecardCriterion"("scorecardId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ScorecardCriterion_scorecardId_order_key" ON "ScorecardCriterion"("scorecardId", "order");

-- CreateIndex
CREATE INDEX "Review_workspaceId_status_finalizedAt_idx" ON "Review"("workspaceId", "status", "finalizedAt");

-- CreateIndex
CREATE INDEX "Review_workspaceId_reviewSource_status_createdAt_idx" ON "Review"("workspaceId", "reviewSource", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Review_workspaceId_reviewerId_createdAt_idx" ON "Review"("workspaceId", "reviewerId", "createdAt");

-- CreateIndex
CREATE INDEX "Review_conversationId_createdAt_idx" ON "Review"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Review_scorecardId_idx" ON "Review"("scorecardId");

-- CreateIndex
CREATE INDEX "ReviewEvent_workspaceId_createdAt_idx" ON "ReviewEvent"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewEvent_reviewId_createdAt_idx" ON "ReviewEvent"("reviewId", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewEvent_conversationId_createdAt_idx" ON "ReviewEvent"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "CriterionScore_criterionId_idx" ON "CriterionScore"("criterionId");

-- CreateIndex
CREATE INDEX "CriterionScore_evidenceMessageId_idx" ON "CriterionScore"("evidenceMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "CriterionScore_reviewId_criterionId_key" ON "CriterionScore"("reviewId", "criterionId");

-- CreateIndex
CREATE INDEX "Finding_reviewId_riskLevel_idx" ON "Finding"("reviewId", "riskLevel");

-- CreateIndex
CREATE INDEX "Finding_riskLevel_createdAt_idx" ON "Finding"("riskLevel", "createdAt");

-- CreateIndex
CREATE INDEX "Finding_category_idx" ON "Finding"("category");

-- CreateIndex
CREATE UNIQUE INDEX "CoachingAction_findingId_key" ON "CoachingAction"("findingId");

-- CreateIndex
CREATE INDEX "CoachingAction_status_dueAt_idx" ON "CoachingAction"("status", "dueAt");

-- CreateIndex
CREATE INDEX "ReviewQuota_workspaceId_periodStart_periodEnd_idx" ON "ReviewQuota"("workspaceId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "ReviewQuota_workspaceId_assigneeName_idx" ON "ReviewQuota"("workspaceId", "assigneeName");

-- CreateIndex
CREATE INDEX "SavedQueueView_workspaceId_userId_idx" ON "SavedQueueView"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "SavedQueueView_workspaceId_scope_order_idx" ON "SavedQueueView"("workspaceId", "scope", "order");

-- CreateIndex
CREATE INDEX "CalibrationSession_workspaceId_status_idx" ON "CalibrationSession"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "CalibrationSession_workspaceId_dueAt_idx" ON "CalibrationSession"("workspaceId", "dueAt");

-- CreateIndex
CREATE INDEX "CalibrationSessionItem_conversationId_idx" ON "CalibrationSessionItem"("conversationId");

-- CreateIndex
CREATE INDEX "CalibrationSessionItem_baselineReviewId_idx" ON "CalibrationSessionItem"("baselineReviewId");

-- CreateIndex
CREATE UNIQUE INDEX "CalibrationSessionItem_sessionId_conversationId_key" ON "CalibrationSessionItem"("sessionId", "conversationId");

-- CreateIndex
CREATE INDEX "CalibrationParticipant_userId_status_idx" ON "CalibrationParticipant"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CalibrationParticipant_sessionId_userId_key" ON "CalibrationParticipant"("sessionId", "userId");

-- CreateIndex
CREATE INDEX "ReviewFeedbackEvent_reviewId_createdAt_idx" ON "ReviewFeedbackEvent"("reviewId", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewFeedbackEvent_actorId_createdAt_idx" ON "ReviewFeedbackEvent"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationRun_workspaceId_startedAt_idx" ON "IntegrationRun"("workspaceId", "startedAt");

-- CreateIndex
CREATE INDEX "IntegrationRun_workspaceId_source_idx" ON "IntegrationRun"("workspaceId", "source");

-- CreateIndex
CREATE INDEX "IntegrationRun_workspaceId_status_startedAt_idx" ON "IntegrationRun"("workspaceId", "status", "startedAt");

-- CreateIndex
CREATE INDEX "IntegrationRun_integrationId_startedAt_idx" ON "IntegrationRun"("integrationId", "startedAt");

-- CreateIndex
CREATE INDEX "BackendJob_status_runAfter_idx" ON "BackendJob"("status", "runAfter");

-- CreateIndex
CREATE INDEX "BackendJob_status_lockedAt_idx" ON "BackendJob"("status", "lockedAt");

-- CreateIndex
CREATE INDEX "BackendJob_queueName_status_priority_runAfter_idx" ON "BackendJob"("queueName", "status", "priority", "runAfter");

-- CreateIndex
CREATE INDEX "BackendJob_workspaceId_status_type_idx" ON "BackendJob"("workspaceId", "status", "type");

-- CreateIndex
CREATE INDEX "BackendJob_workspaceId_createdAt_idx" ON "BackendJob"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "BackendJobEvent_jobId_createdAt_idx" ON "BackendJobEvent"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "IdempotencyKey_workspaceId_expiresAt_idx" ON "IdempotencyKey"("workspaceId", "expiresAt");

-- CreateIndex
CREATE INDEX "IdempotencyKey_workspaceId_status_expiresAt_idx" ON "IdempotencyKey"("workspaceId", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_workspaceId_key_key" ON "IdempotencyKey"("workspaceId", "key");

-- CreateIndex
CREATE INDEX "SamplingRule_workspaceId_isActive_idx" ON "SamplingRule"("workspaceId", "isActive");

-- CreateIndex
CREATE INDEX "QualityKnowledgeEntry_workspaceId_category_idx" ON "QualityKnowledgeEntry"("workspaceId", "category");

-- CreateIndex
CREATE INDEX "TrainingAssignment_workspaceId_status_idx" ON "TrainingAssignment"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "TrainingAssignment_workspaceId_status_dueAt_idx" ON "TrainingAssignment"("workspaceId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "TrainingAssignment_workspaceId_assigneeName_idx" ON "TrainingAssignment"("workspaceId", "assigneeName");

-- CreateIndex
CREATE INDEX "ReportSnapshot_workspaceId_periodStart_periodEnd_idx" ON "ReportSnapshot"("workspaceId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "ReportSnapshot_workspaceId_status_idx" ON "ReportSnapshot"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "ReportSnapshot_workspaceId_createdById_createdAt_idx" ON "ReportSnapshot"("workspaceId", "createdById", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_workspaceId_createdAt_idx" ON "AuditLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_workspaceId_action_createdAt_idx" ON "AuditLog"("workspaceId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_workspaceId_targetType_targetId_idx" ON "AuditLog"("workspaceId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityProvider" ADD CONSTRAINT "IdentityProvider_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalIdentity" ADD CONSTRAINT "ExternalIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalIdentity" ADD CONSTRAINT "ExternalIdentity_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "IdentityProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupRoleMapping" ADD CONSTRAINT "GroupRoleMapping_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupRoleMapping" ADD CONSTRAINT "GroupRoleMapping_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "IdentityProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "IdentityProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationCredential" ADD CONSTRAINT "IntegrationCredential_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiRateLimit" ADD CONSTRAINT "ApiRateLimit_apiTokenId_fkey" FOREIGN KEY ("apiTokenId") REFERENCES "ApiToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scorecard" ADD CONSTRAINT "Scorecard_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScorecardCriterion" ADD CONSTRAINT "ScorecardCriterion_scorecardId_fkey" FOREIGN KEY ("scorecardId") REFERENCES "Scorecard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_scorecardId_fkey" FOREIGN KEY ("scorecardId") REFERENCES "Scorecard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewEvent" ADD CONSTRAINT "ReviewEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewEvent" ADD CONSTRAINT "ReviewEvent_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewEvent" ADD CONSTRAINT "ReviewEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriterionScore" ADD CONSTRAINT "CriterionScore_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriterionScore" ADD CONSTRAINT "CriterionScore_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "ScorecardCriterion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriterionScore" ADD CONSTRAINT "CriterionScore_evidenceMessageId_fkey" FOREIGN KEY ("evidenceMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachingAction" ADD CONSTRAINT "CoachingAction_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewQuota" ADD CONSTRAINT "ReviewQuota_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedQueueView" ADD CONSTRAINT "SavedQueueView_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedQueueView" ADD CONSTRAINT "SavedQueueView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationSession" ADD CONSTRAINT "CalibrationSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationSession" ADD CONSTRAINT "CalibrationSession_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationSession" ADD CONSTRAINT "CalibrationSession_scorecardId_fkey" FOREIGN KEY ("scorecardId") REFERENCES "Scorecard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationSessionItem" ADD CONSTRAINT "CalibrationSessionItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CalibrationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationSessionItem" ADD CONSTRAINT "CalibrationSessionItem_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationSessionItem" ADD CONSTRAINT "CalibrationSessionItem_baselineReviewId_fkey" FOREIGN KEY ("baselineReviewId") REFERENCES "Review"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationParticipant" ADD CONSTRAINT "CalibrationParticipant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CalibrationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationParticipant" ADD CONSTRAINT "CalibrationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewFeedbackEvent" ADD CONSTRAINT "ReviewFeedbackEvent_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewFeedbackEvent" ADD CONSTRAINT "ReviewFeedbackEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationRun" ADD CONSTRAINT "IntegrationRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationRun" ADD CONSTRAINT "IntegrationRun_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationRun" ADD CONSTRAINT "IntegrationRun_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackendJob" ADD CONSTRAINT "BackendJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackendJob" ADD CONSTRAINT "BackendJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackendJobEvent" ADD CONSTRAINT "BackendJobEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BackendJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SamplingRule" ADD CONSTRAINT "SamplingRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityKnowledgeEntry" ADD CONSTRAINT "QualityKnowledgeEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSnapshot" ADD CONSTRAINT "ReportSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSnapshot" ADD CONSTRAINT "ReportSnapshot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
