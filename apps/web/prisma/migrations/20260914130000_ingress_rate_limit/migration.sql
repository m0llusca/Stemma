-- Shared ingress rate-limit buckets (webhooks) without requiring an API token.
CREATE TABLE "IngressRateLimit" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "routeKey" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngressRateLimit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IngressRateLimit_workspaceId_windowStart_idx" ON "IngressRateLimit"("workspaceId", "windowStart");

CREATE UNIQUE INDEX "IngressRateLimit_workspaceId_routeKey_windowStart_key" ON "IngressRateLimit"("workspaceId", "routeKey", "windowStart");

ALTER TABLE "IngressRateLimit" ADD CONSTRAINT "IngressRateLimit_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IngressRateLimit"
  ADD CONSTRAINT "IngressRateLimit_requestCount_nonnegative_chk"
  CHECK ("requestCount" >= 0);
