-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CalibrationSessionItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "baselineReviewId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CalibrationSessionItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CalibrationSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CalibrationSessionItem_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CalibrationSessionItem_baselineReviewId_fkey" FOREIGN KEY ("baselineReviewId") REFERENCES "Review" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CalibrationSessionItem" ("baselineReviewId", "conversationId", "createdAt", "id", "sessionId") SELECT "baselineReviewId", "conversationId", "createdAt", "id", "sessionId" FROM "CalibrationSessionItem";
DROP TABLE "CalibrationSessionItem";
ALTER TABLE "new_CalibrationSessionItem" RENAME TO "CalibrationSessionItem";
CREATE INDEX "CalibrationSessionItem_conversationId_idx" ON "CalibrationSessionItem"("conversationId");
CREATE INDEX "CalibrationSessionItem_baselineReviewId_idx" ON "CalibrationSessionItem"("baselineReviewId");
CREATE UNIQUE INDEX "CalibrationSessionItem_sessionId_conversationId_key" ON "CalibrationSessionItem"("sessionId", "conversationId");
CREATE TABLE "new_CriterionScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reviewId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "value" INTEGER,
    "passed" BOOLEAN,
    "isNotApplicable" BOOLEAN NOT NULL DEFAULT false,
    "comment" TEXT NOT NULL,
    "evidenceMessageId" TEXT,
    CONSTRAINT "CriterionScore_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CriterionScore_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "ScorecardCriterion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CriterionScore_evidenceMessageId_fkey" FOREIGN KEY ("evidenceMessageId") REFERENCES "Message" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CriterionScore" ("comment", "criterionId", "evidenceMessageId", "id", "isNotApplicable", "passed", "reviewId", "value") SELECT "comment", "criterionId", "evidenceMessageId", "id", "isNotApplicable", "passed", "reviewId", "value" FROM "CriterionScore";
DROP TABLE "CriterionScore";
ALTER TABLE "new_CriterionScore" RENAME TO "CriterionScore";
CREATE INDEX "CriterionScore_criterionId_idx" ON "CriterionScore"("criterionId");
CREATE INDEX "CriterionScore_evidenceMessageId_idx" ON "CriterionScore"("evidenceMessageId");
CREATE UNIQUE INDEX "CriterionScore_reviewId_criterionId_key" ON "CriterionScore"("reviewId", "criterionId");
CREATE TABLE "new_Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "participantType" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sentAt" DATETIME NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Message" ("authorName", "body", "conversationId", "createdAt", "externalId", "id", "isPrivate", "participantType", "sentAt") SELECT "authorName", "body", "conversationId", "createdAt", "externalId", "id", "isPrivate", "participantType", "sentAt" FROM "Message";
DROP TABLE "Message";
ALTER TABLE "new_Message" RENAME TO "Message";
CREATE INDEX "Message_conversationId_sentAt_idx" ON "Message"("conversationId", "sentAt");
CREATE UNIQUE INDEX "Message_conversationId_externalId_key" ON "Message"("conversationId", "externalId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ApiToken_workspaceId_updatedAt_idx" ON "ApiToken"("workspaceId", "updatedAt");

-- CreateIndex
CREATE INDEX "AuditLog_workspaceId_createdAt_idx" ON "AuditLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_workspaceId_action_createdAt_idx" ON "AuditLog"("workspaceId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_workspaceId_targetType_targetId_idx" ON "AuditLog"("workspaceId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuthSession_workspaceId_status_expiresAt_idx" ON "AuthSession"("workspaceId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "BackendJob_status_lockedAt_idx" ON "BackendJob"("status", "lockedAt");

-- CreateIndex
CREATE INDEX "BackendJob_queueName_status_priority_runAfter_idx" ON "BackendJob"("queueName", "status", "priority", "runAfter");

-- CreateIndex
CREATE INDEX "BackendJob_workspaceId_createdAt_idx" ON "BackendJob"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "CalibrationParticipant_userId_status_idx" ON "CalibrationParticipant"("userId", "status");

-- CreateIndex
CREATE INDEX "CalibrationSession_workspaceId_dueAt_idx" ON "CalibrationSession"("workspaceId", "dueAt");

-- CreateIndex
CREATE INDEX "CoachingAction_status_dueAt_idx" ON "CoachingAction"("status", "dueAt");

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
CREATE INDEX "ExternalIdentity_providerId_email_idx" ON "ExternalIdentity"("providerId", "email");

-- CreateIndex
CREATE INDEX "Finding_reviewId_riskLevel_idx" ON "Finding"("reviewId", "riskLevel");

-- CreateIndex
CREATE INDEX "Finding_riskLevel_createdAt_idx" ON "Finding"("riskLevel", "createdAt");

-- CreateIndex
CREATE INDEX "Finding_category_idx" ON "Finding"("category");

-- CreateIndex
CREATE INDEX "GroupRoleMapping_providerId_isActive_idx" ON "GroupRoleMapping"("providerId", "isActive");

-- CreateIndex
CREATE INDEX "IdempotencyKey_workspaceId_status_expiresAt_idx" ON "IdempotencyKey"("workspaceId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "IdentityProvider_workspaceId_status_idx" ON "IdentityProvider"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Integration_workspaceId_status_idx" ON "Integration"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Integration_workspaceId_updatedAt_idx" ON "Integration"("workspaceId", "updatedAt");

-- CreateIndex
CREATE INDEX "IntegrationRun_workspaceId_status_startedAt_idx" ON "IntegrationRun"("workspaceId", "status", "startedAt");

-- CreateIndex
CREATE INDEX "IntegrationRun_integrationId_startedAt_idx" ON "IntegrationRun"("integrationId", "startedAt");

-- CreateIndex
CREATE INDEX "ReportSnapshot_workspaceId_createdById_createdAt_idx" ON "ReportSnapshot"("workspaceId", "createdById", "createdAt");

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
CREATE INDEX "ReviewFeedbackEvent_actorId_createdAt_idx" ON "ReviewFeedbackEvent"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "SavedQueueView_workspaceId_scope_order_idx" ON "SavedQueueView"("workspaceId", "scope", "order");

-- CreateIndex
CREATE INDEX "Scorecard_workspaceId_isActive_idx" ON "Scorecard"("workspaceId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Scorecard_workspaceId_version_key" ON "Scorecard"("workspaceId", "version");

-- CreateIndex
CREATE INDEX "TrainingAssignment_workspaceId_status_dueAt_idx" ON "TrainingAssignment"("workspaceId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "User_workspaceId_role_name_idx" ON "User"("workspaceId", "role", "name");
