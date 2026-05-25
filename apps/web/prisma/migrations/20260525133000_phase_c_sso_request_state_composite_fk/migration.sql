-- Phase C follow-up: ensure SAML/OIDC request-state rows cannot point to a provider from another workspace.
DELETE FROM "SsoRequestState" state
WHERE NOT EXISTS (
  SELECT 1
  FROM "IdentityProvider" provider
  WHERE provider."id" = state."providerId"
    AND provider."workspaceId" = state."workspaceId"
);

ALTER TABLE "SsoRequestState" DROP CONSTRAINT "SsoRequestState_providerId_fkey";

ALTER TABLE "SsoRequestState" ADD CONSTRAINT "SsoRequestState_providerId_workspaceId_fkey"
  FOREIGN KEY ("providerId", "workspaceId")
  REFERENCES "IdentityProvider"("id", "workspaceId")
  ON DELETE CASCADE ON UPDATE CASCADE;
