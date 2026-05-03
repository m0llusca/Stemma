-- CreateTable
CREATE TABLE "IdentityProvider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
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
    "lastSyncAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IdentityProvider_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExternalIdentity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerSubject" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "rawClaimsJson" TEXT NOT NULL DEFAULT '{}',
    "linkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" DATETIME,
    CONSTRAINT "ExternalIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExternalIdentity_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "IdentityProvider" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GroupRoleMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "providerId" TEXT,
    "externalGroupId" TEXT NOT NULL,
    "externalGroupName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GroupRoleMapping_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GroupRoleMapping_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "IdentityProvider" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT,
    "sessionTokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "ipHash" TEXT,
    "userAgent" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuthSession_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "IdentityProvider" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IntegrationCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "authMode" TEXT NOT NULL,
    "encryptedSecret" TEXT NOT NULL,
    "keyVersion" TEXT NOT NULL DEFAULT 'local-dev',
    "lastRotatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IntegrationCredential_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApiRateLimit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "apiTokenId" TEXT NOT NULL,
    "routeKey" TEXT NOT NULL,
    "windowStart" DATETIME NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ApiRateLimit_apiTokenId_fkey" FOREIGN KEY ("apiTokenId") REFERENCES "ApiToken" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReviewEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "reviewId" TEXT,
    "conversationId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReviewEvent_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReviewEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BackendJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "queueName" TEXT NOT NULL DEFAULT 'default',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "resultJson" TEXT NOT NULL DEFAULT '{}',
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "runAfter" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" DATETIME,
    "lockedBy" TEXT,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BackendJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BackendJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BackendJobEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BackendJobEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BackendJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER,
    "responseBodyJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IdempotencyKey_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReportSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "filtersJson" TEXT NOT NULL DEFAULT '{}',
    "metricsJson" TEXT NOT NULL DEFAULT '{}',
    "exportFormat" TEXT,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "filePath" TEXT,
    "fileSize" INTEGER,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReportSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReportSnapshot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "IdentityProvider_workspaceId_type_idx" ON "IdentityProvider"("workspaceId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "IdentityProvider_workspaceId_slug_key" ON "IdentityProvider"("workspaceId", "slug");

-- CreateIndex
CREATE INDEX "ExternalIdentity_userId_idx" ON "ExternalIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdentity_providerId_providerSubject_key" ON "ExternalIdentity"("providerId", "providerSubject");

-- CreateIndex
CREATE INDEX "GroupRoleMapping_workspaceId_isActive_idx" ON "GroupRoleMapping"("workspaceId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "GroupRoleMapping_workspaceId_externalGroupId_role_key" ON "GroupRoleMapping"("workspaceId", "externalGroupId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_sessionTokenHash_key" ON "AuthSession"("sessionTokenHash");

-- CreateIndex
CREATE INDEX "AuthSession_workspaceId_userId_idx" ON "AuthSession"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "AuthSession_status_expiresAt_idx" ON "AuthSession"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationCredential_integrationId_key" ON "IntegrationCredential"("integrationId");

-- CreateIndex
CREATE INDEX "IntegrationCredential_workspaceId_idx" ON "IntegrationCredential"("workspaceId");

-- CreateIndex
CREATE INDEX "ApiRateLimit_workspaceId_windowStart_idx" ON "ApiRateLimit"("workspaceId", "windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "ApiRateLimit_apiTokenId_routeKey_windowStart_key" ON "ApiRateLimit"("apiTokenId", "routeKey", "windowStart");

-- CreateIndex
CREATE INDEX "ReviewEvent_workspaceId_createdAt_idx" ON "ReviewEvent"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewEvent_reviewId_createdAt_idx" ON "ReviewEvent"("reviewId", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewEvent_conversationId_createdAt_idx" ON "ReviewEvent"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "BackendJob_status_runAfter_idx" ON "BackendJob"("status", "runAfter");

-- CreateIndex
CREATE INDEX "BackendJob_workspaceId_status_type_idx" ON "BackendJob"("workspaceId", "status", "type");

-- CreateIndex
CREATE INDEX "BackendJobEvent_jobId_createdAt_idx" ON "BackendJobEvent"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "IdempotencyKey_workspaceId_expiresAt_idx" ON "IdempotencyKey"("workspaceId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_workspaceId_key_key" ON "IdempotencyKey"("workspaceId", "key");

-- CreateIndex
CREATE INDEX "ReportSnapshot_workspaceId_periodStart_periodEnd_idx" ON "ReportSnapshot"("workspaceId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "ReportSnapshot_workspaceId_status_idx" ON "ReportSnapshot"("workspaceId", "status");
