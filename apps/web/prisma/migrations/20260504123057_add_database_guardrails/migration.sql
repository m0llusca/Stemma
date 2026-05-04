-- AddCheckConstraints
ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_csatScore_range_chk"
  CHECK ("csatScore" IS NULL OR "csatScore" BETWEEN 1 AND 5);

ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_csatBucket_chk"
  CHECK ("csatBucket" IN ('NEGATIVE', 'POSITIVE', 'NO_SCORE'));

ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_samplingType_chk"
  CHECK ("samplingType" IN ('RANDOM', 'DSAT', 'LEAD_SIGNAL', 'NEW_HIRE', 'LOW_SCORE', 'MANUAL'));

ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_closedAt_after_openedAt_chk"
  CHECK ("closedAt" IS NULL OR "closedAt" >= "openedAt");

ALTER TABLE "GroupRoleMapping"
  ADD CONSTRAINT "GroupRoleMapping_priority_range_chk"
  CHECK ("priority" BETWEEN 1 AND 1000);

ALTER TABLE "Integration"
  ADD CONSTRAINT "Integration_importLimit_range_chk"
  CHECK ("importLimit" BETWEEN 1 AND 10000);

ALTER TABLE "Integration"
  ADD CONSTRAINT "Integration_batchSize_range_chk"
  CHECK ("batchSize" BETWEEN 1 AND 1000);

ALTER TABLE "Integration"
  ADD CONSTRAINT "Integration_dateRangeDays_range_chk"
  CHECK ("dateRangeDays" BETWEEN 1 AND 365);

ALTER TABLE "ApiRateLimit"
  ADD CONSTRAINT "ApiRateLimit_requestCount_nonnegative_chk"
  CHECK ("requestCount" >= 0);

ALTER TABLE "Scorecard"
  ADD CONSTRAINT "Scorecard_version_positive_chk"
  CHECK ("version" >= 1);

ALTER TABLE "ScorecardCriterion"
  ADD CONSTRAINT "ScorecardCriterion_weight_range_chk"
  CHECK ("weight" BETWEEN 0 AND 100);

ALTER TABLE "ScorecardCriterion"
  ADD CONSTRAINT "ScorecardCriterion_order_positive_chk"
  CHECK ("order" >= 1);

ALTER TABLE "Review"
  ADD CONSTRAINT "Review_totalScore_range_chk"
  CHECK ("totalScore" BETWEEN 0 AND 100);

ALTER TABLE "Review"
  ADD CONSTRAINT "Review_confidence_range_chk"
  CHECK ("confidence" IS NULL OR "confidence" BETWEEN 0 AND 1);

ALTER TABLE "Review"
  ADD CONSTRAINT "Review_finalizedAt_required_chk"
  CHECK ("status" <> 'FINALIZED' OR "finalizedAt" IS NOT NULL);

ALTER TABLE "Review"
  ADD CONSTRAINT "Review_feedbackStatus_chk"
  CHECK ("feedbackStatus" IN ('new', 'feedback_sent', 'acknowledged', 'appeal', 'corrected'));

ALTER TABLE "Review"
  ADD CONSTRAINT "Review_appealStatus_chk"
  CHECK ("appealStatus" IN ('none', 'open', 'confirmed', 'corrected', 'calibration'));

ALTER TABLE "Review"
  ADD CONSTRAINT "Review_reanswerStatus_chk"
  CHECK ("reanswerStatus" IN ('not_needed', 'required', 'requested', 'completed'));

ALTER TABLE "Review"
  ADD CONSTRAINT "Review_calibrationStatus_chk"
  CHECK ("calibrationStatus" IN ('none', 'queued', 'active', 'completed', 'archived'));

ALTER TABLE "CriterionScore"
  ADD CONSTRAINT "CriterionScore_value_range_chk"
  CHECK ("value" IS NULL OR "value" BETWEEN 1 AND 3);

ALTER TABLE "ReviewQuota"
  ADD CONSTRAINT "ReviewQuota_plannedCount_nonnegative_chk"
  CHECK ("plannedCount" >= 0);

ALTER TABLE "ReviewQuota"
  ADD CONSTRAINT "ReviewQuota_dsatTargetPercent_range_chk"
  CHECK ("dsatTargetPercent" BETWEEN 0 AND 100);

ALTER TABLE "ReviewQuota"
  ADD CONSTRAINT "ReviewQuota_absenceDays_nonnegative_chk"
  CHECK ("absenceDays" >= 0);

ALTER TABLE "ReviewQuota"
  ADD CONSTRAINT "ReviewQuota_period_order_chk"
  CHECK ("periodEnd" >= "periodStart");

ALTER TABLE "IntegrationRun"
  ADD CONSTRAINT "IntegrationRun_requestedLimit_range_chk"
  CHECK ("requestedLimit" BETWEEN 1 AND 10000);

ALTER TABLE "IntegrationRun"
  ADD CONSTRAINT "IntegrationRun_importedCount_nonnegative_chk"
  CHECK ("importedCount" >= 0);

ALTER TABLE "IntegrationRun"
  ADD CONSTRAINT "IntegrationRun_errorCount_nonnegative_chk"
  CHECK ("errorCount" >= 0);

ALTER TABLE "IntegrationRun"
  ADD CONSTRAINT "IntegrationRun_importedCount_limit_chk"
  CHECK ("importedCount" <= "requestedLimit");

ALTER TABLE "IntegrationRun"
  ADD CONSTRAINT "IntegrationRun_finishedAt_after_startedAt_chk"
  CHECK ("finishedAt" IS NULL OR "finishedAt" >= "startedAt");

ALTER TABLE "BackendJob"
  ADD CONSTRAINT "BackendJob_priority_range_chk"
  CHECK ("priority" BETWEEN 1 AND 1000);

ALTER TABLE "BackendJob"
  ADD CONSTRAINT "BackendJob_attempts_range_chk"
  CHECK ("attempts" >= 0 AND "attempts" <= "maxAttempts");

ALTER TABLE "BackendJob"
  ADD CONSTRAINT "BackendJob_maxAttempts_range_chk"
  CHECK ("maxAttempts" BETWEEN 1 AND 10);

ALTER TABLE "IdempotencyKey"
  ADD CONSTRAINT "IdempotencyKey_responseStatus_range_chk"
  CHECK ("responseStatus" IS NULL OR "responseStatus" BETWEEN 100 AND 599);

ALTER TABLE "IdempotencyKey"
  ADD CONSTRAINT "IdempotencyKey_expiresAt_after_createdAt_chk"
  CHECK ("expiresAt" > "createdAt");

ALTER TABLE "SamplingRule"
  ADD CONSTRAINT "SamplingRule_targetPercent_range_chk"
  CHECK ("targetPercent" BETWEEN 1 AND 100);

ALTER TABLE "SamplingRule"
  ADD CONSTRAINT "SamplingRule_priority_range_chk"
  CHECK ("priority" BETWEEN 1 AND 1000);

ALTER TABLE "ReportSnapshot"
  ADD CONSTRAINT "ReportSnapshot_period_order_chk"
  CHECK ("periodEnd" >= "periodStart");

ALTER TABLE "ReportSnapshot"
  ADD CONSTRAINT "ReportSnapshot_fileSize_nonnegative_chk"
  CHECK ("fileSize" IS NULL OR "fileSize" >= 0);

-- CreatePartialIndexes
CREATE INDEX "AuthSession_active_workspace_user_expiresAt_idx"
  ON "AuthSession"("workspaceId", "userId", "expiresAt")
  WHERE "status" = 'ACTIVE';

CREATE INDEX "BackendJob_runnable_queue_priority_idx"
  ON "BackendJob"("queueName", "priority", "runAfter", "createdAt")
  WHERE "status" = 'QUEUED' AND "lockedAt" IS NULL;

CREATE INDEX "IdempotencyKey_in_progress_expiresAt_idx"
  ON "IdempotencyKey"("workspaceId", "expiresAt")
  WHERE "status" = 'IN_PROGRESS';

CREATE INDEX "Review_open_appeal_due_idx"
  ON "Review"("workspaceId", "appealDueAt", "createdAt")
  WHERE "appealStatus" = 'open';

CREATE INDEX "TrainingAssignment_open_due_idx"
  ON "TrainingAssignment"("workspaceId", "dueAt", "createdAt")
  WHERE "status" <> 'done';
