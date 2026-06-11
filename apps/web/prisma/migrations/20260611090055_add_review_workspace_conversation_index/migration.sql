-- CreateIndex
CREATE INDEX "Review_workspaceId_conversationId_idx" ON "Review"("workspaceId", "conversationId");

-- RenameIndex
ALTER INDEX "CertificationEvidence_workspaceId_targetType_source_recordedAt_" RENAME TO "CertificationEvidence_workspaceId_targetType_source_recorde_idx";

-- RenameIndex
ALTER INDEX "GroupRoleMapping_workspaceId_providerId_externalGroupId_role_ke" RENAME TO "GroupRoleMapping_workspaceId_providerId_externalGroupId_rol_key";
