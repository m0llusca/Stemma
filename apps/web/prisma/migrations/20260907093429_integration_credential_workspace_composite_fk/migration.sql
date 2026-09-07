-- Ensure credentials cannot point at an Integration from another workspace.
DELETE FROM "IntegrationCredential" credential
WHERE NOT EXISTS (
  SELECT 1
  FROM "Integration" integration
  WHERE integration."id" = credential."integrationId"
    AND integration."workspaceId" = credential."workspaceId"
);

ALTER TABLE "IntegrationCredential" DROP CONSTRAINT "IntegrationCredential_integrationId_fkey";

ALTER TABLE "IntegrationCredential"
  ADD CONSTRAINT "IntegrationCredential_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "IntegrationCredential"
  ADD CONSTRAINT "IntegrationCredential_integrationId_workspaceId_fkey"
  FOREIGN KEY ("integrationId", "workspaceId") REFERENCES "Integration"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
