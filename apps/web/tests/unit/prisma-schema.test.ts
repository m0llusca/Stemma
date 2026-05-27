import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const migrationLock = readFileSync(join(process.cwd(), "prisma/migrations/migration_lock.toml"), "utf8");
const migrationsDir = join(process.cwd(), "prisma/migrations");
const baselineMigration = readFileSync(
  join(migrationsDir, "20260504122200_postgresql_baseline/migration.sql"),
  "utf8"
);
const guardrailsMigration = readFileSync(
  join(migrationsDir, "20260504123057_add_database_guardrails/migration.sql"),
  "utf8"
);
const credentialKindsMigrationName = readdirSync(migrationsDir).find((name) => name.endsWith("_add_integration_credential_kinds"));
const credentialKindsMigration = credentialKindsMigrationName
  ? readFileSync(join(migrationsDir, credentialKindsMigrationName, "migration.sql"), "utf8")
  : "";
const diagnosticsMigrationName = readdirSync(migrationsDir).find((name) => name.endsWith("_add_integration_diagnostics"));
const diagnosticsMigration = diagnosticsMigrationName
  ? readFileSync(join(migrationsDir, diagnosticsMigrationName, "migration.sql"), "utf8")
  : "";
const syncStateMigrationName = readdirSync(migrationsDir).find((name) => name.endsWith("_add_integration_sync_state"));
const syncStateMigration = syncStateMigrationName
  ? readFileSync(join(migrationsDir, syncStateMigrationName, "migration.sql"), "utf8")
  : "";
const webhookIngestMigrationName = readdirSync(migrationsDir).find((name) => name.endsWith("_add_webhook_ingest"));
const webhookIngestMigration = webhookIngestMigrationName
  ? readFileSync(join(migrationsDir, webhookIngestMigrationName, "migration.sql"), "utf8")
  : "";
const identityLifecycleMigrationName = readdirSync(migrationsDir).find((name) => name.endsWith("_phase_c_identity_lifecycle"));
const identityLifecycleMigration = identityLifecycleMigrationName
  ? readFileSync(join(migrationsDir, identityLifecycleMigrationName, "migration.sql"), "utf8")
  : "";
const samlRequestStateMigrationName = readdirSync(migrationsDir).find((name) => name.endsWith("_phase_c_saml_request_state"));
const samlRequestStateMigration = samlRequestStateMigrationName
  ? readFileSync(join(migrationsDir, samlRequestStateMigrationName, "migration.sql"), "utf8")
  : "";
const ssoRequestStateCompositeFkMigrationName = readdirSync(migrationsDir).find((name) =>
  name.endsWith("_phase_c_sso_request_state_composite_fk")
);
const ssoRequestStateCompositeFkMigration = ssoRequestStateCompositeFkMigrationName
  ? readFileSync(join(migrationsDir, ssoRequestStateCompositeFkMigrationName, "migration.sql"), "utf8")
  : "";
const certificationEvidenceMigrationName = readdirSync(migrationsDir).find((name) => name.endsWith("_phase_d_certification_evidence"));
const certificationEvidenceMigration = certificationEvidenceMigrationName
  ? readFileSync(join(migrationsDir, certificationEvidenceMigrationName, "migration.sql"), "utf8")
  : "";
const workspaceBrandingMigrationName = readdirSync(migrationsDir).find((name) => name.endsWith("_add_workspace_branding"));
const workspaceBrandingMigration = workspaceBrandingMigrationName
  ? readFileSync(join(migrationsDir, workspaceBrandingMigrationName, "migration.sql"), "utf8")
  : "";
const workspacePaletteMigrationName = readdirSync(migrationsDir).find((name) => name.endsWith("_add_workspace_palette_overrides"));
const workspacePaletteMigration = workspacePaletteMigrationName
  ? readFileSync(join(migrationsDir, workspacePaletteMigrationName, "migration.sql"), "utf8")
  : "";

function modelBlock(name: string) {
  return schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? "";
}

describe("prisma schema database foundations", () => {
  it("uses PostgreSQL as the only Prisma datasource provider", () => {
    expect(schema).toContain('provider = "postgresql"');
    expect(migrationLock).toContain('provider = "postgresql"');
    expect(baselineMigration).toContain('CREATE SCHEMA IF NOT EXISTS "public";');
    expect(baselineMigration).not.toContain("PRAGMA");
  });

  it("stores workspace branding separately from operational theme tokens", () => {
    const workspaceModel = modelBlock("Workspace");

    expect(workspaceModel).toContain("brandName                 String?");
    expect(workspaceModel).toContain("brandTagline              String?");
    expect(workspaceModel).toContain("brandLogoUrl              String?");
    expect(workspaceModel).toContain("brandLogoAlt              String?");
    expect(workspaceModel).toContain("brandMark                 String?");
    expect(workspaceModel).toContain('brandPrimaryColor         String                     @default("#3157d5")');
    expect(workspaceModel).toContain('brandAccentColor          String                     @default("#7c97ff")');
    expect(workspaceModel).toContain('uiPaletteOverridesJson    String                     @default("{}")');
    expect(workspaceBrandingMigration).toContain('ADD COLUMN "brandLogoUrl" TEXT');
    expect(workspaceBrandingMigration).toContain('CONSTRAINT "Workspace_brandPrimaryColor_chk"');
    expect(workspaceBrandingMigration).toContain('CONSTRAINT "Workspace_brandAccentColor_chk"');
    expect(workspacePaletteMigration).toContain('ADD COLUMN "uiPaletteOverridesJson" TEXT NOT NULL DEFAULT');
  });

  it("keeps evidence and calibration baseline references as database foreign keys", () => {
    expect(schema).toMatch(
      /evidenceMessage\s+Message\?\s+@relation\("CriterionScoreEvidenceMessage", fields: \[evidenceMessageId], references: \[id], onDelete: SetNull\)/
    );
    expect(schema).toMatch(
      /baselineReview\s+Review\?\s+@relation\("CalibrationBaselineReview", fields: \[baselineReviewId], references: \[id], onDelete: SetNull\)/
    );
    expect(baselineMigration).toContain(
      'ALTER TABLE "CriterionScore" ADD CONSTRAINT "CriterionScore_evidenceMessageId_fkey" FOREIGN KEY ("evidenceMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE'
    );
    expect(baselineMigration).toContain(
      'ALTER TABLE "CalibrationSessionItem" ADD CONSTRAINT "CalibrationSessionItem_baselineReviewId_fkey" FOREIGN KEY ("baselineReviewId") REFERENCES "Review"("id") ON DELETE SET NULL ON UPDATE CASCADE'
    );
  });

  it("keeps versioned scorecards unique within a workspace", () => {
    expect(schema).toContain("@@unique([workspaceId, version])");
    expect(baselineMigration).toContain('CREATE UNIQUE INDEX "Scorecard_workspaceId_version_key" ON "Scorecard"("workspaceId", "version")');
  });

  it("keeps hot-path indexes for queue, reports, jobs and audit", () => {
    const expectedIndexes = [
      "@@index([workspaceId, openedAt])",
      "@@index([workspaceId, status, finalizedAt])",
      "@@index([queueName, status, priority, runAfter])",
      "@@index([workspaceId, action, createdAt])"
    ];

    for (const index of expectedIndexes) {
      expect(schema).toContain(index);
    }

    const expectedMigrationIndexes = [
      'CREATE INDEX "Conversation_workspaceId_openedAt_idx"',
      'CREATE INDEX "Review_workspaceId_status_finalizedAt_idx"',
      'CREATE INDEX "BackendJob_queueName_status_priority_runAfter_idx"',
      'CREATE INDEX "AuditLog_workspaceId_action_createdAt_idx"'
    ];

    for (const index of expectedMigrationIndexes) {
      expect(baselineMigration).toContain(index);
    }
  });

  it("keeps PostgreSQL guardrails for scores, periods, retries and partial hot paths", () => {
    const expectedConstraints = [
      'CONSTRAINT "Conversation_csatScore_range_chk"',
      'CONSTRAINT "Conversation_closedAt_after_openedAt_chk"',
      'CONSTRAINT "Review_totalScore_range_chk"',
      'CONSTRAINT "Review_finalizedAt_required_chk"',
      'CONSTRAINT "CriterionScore_value_range_chk"',
      'CONSTRAINT "BackendJob_attempts_range_chk"',
      'CONSTRAINT "IntegrationRun_finishedAt_after_startedAt_chk"',
      'CONSTRAINT "ReportSnapshot_period_order_chk"'
    ];

    for (const constraint of expectedConstraints) {
      expect(guardrailsMigration).toContain(constraint);
    }

    const expectedPartialIndexes = [
      'CREATE INDEX "AuthSession_active_workspace_user_expiresAt_idx"',
      'CREATE INDEX "BackendJob_runnable_queue_priority_idx"',
      'CREATE INDEX "IdempotencyKey_in_progress_expiresAt_idx"',
      'CREATE INDEX "Review_open_appeal_due_idx"',
      'CREATE INDEX "TrainingAssignment_open_due_idx"'
    ];

    for (const index of expectedPartialIndexes) {
      expect(guardrailsMigration).toContain(index);
    }

    expect(guardrailsMigration).toContain('WHERE "status" = \'QUEUED\' AND "lockedAt" IS NULL');
  });

  it("stores integration credentials as one secret slot per kind", () => {
    const integrationModel = schema.match(/model Integration \{[\s\S]*?\n\}/)?.[0] ?? "";
    const credentialModel = schema.match(/model IntegrationCredential \{[\s\S]*?\n\}/)?.[0] ?? "";

    expect(integrationModel).toMatch(/credentials\s+IntegrationCredential\[]/);
    expect(integrationModel).not.toContain("credential    IntegrationCredential?");
    expect(credentialModel).toContain('kind            String      @default("auth_password")');
    expect(credentialModel).toContain("fingerprint     String?");
    expect(credentialModel).toContain("@@unique([integrationId, kind])");
    expect(credentialModel).toContain("@@index([workspaceId, kind])");
    expect(credentialModel).not.toMatch(/integrationId\s+String\s+@unique/);
  });

  it("migrates integration credential uniqueness from integration to integration and kind", () => {
    expect(credentialKindsMigrationName).toMatch(/^\d+_add_integration_credential_kinds$/);
    expect(credentialKindsMigration).toContain('ALTER TABLE "IntegrationCredential" ADD COLUMN "kind" TEXT NOT NULL DEFAULT \'auth_password\'');
    expect(credentialKindsMigration).toContain('ALTER TABLE "IntegrationCredential" ADD COLUMN "fingerprint" TEXT');
    expect(credentialKindsMigration).toContain('DROP INDEX "IntegrationCredential_integrationId_key"');
    expect(credentialKindsMigration).toContain(
      'CREATE UNIQUE INDEX "IntegrationCredential_integrationId_kind_key" ON "IntegrationCredential"("integrationId", "kind")'
    );
    expect(credentialKindsMigration).toContain(
      'CREATE INDEX "IntegrationCredential_workspaceId_kind_idx" ON "IntegrationCredential"("workspaceId", "kind")'
    );
  });

  it("stores integration diagnostic runs, steps, and item-level import outcomes", () => {
    const workspaceModel = modelBlock("Workspace");
    const userModel = modelBlock("User");
    const integrationModel = modelBlock("Integration");
    const integrationRunModel = modelBlock("IntegrationRun");
    const conversationModel = modelBlock("Conversation");
    const diagnosticRunModel = modelBlock("IntegrationDiagnosticRun");
    const diagnosticStepModel = modelBlock("IntegrationDiagnosticStep");
    const runItemModel = modelBlock("IntegrationRunItem");

    expect(diagnosticRunModel).not.toBe("");
    expect(diagnosticStepModel).not.toBe("");
    expect(runItemModel).not.toBe("");

    expect(workspaceModel).toMatch(/integrationDiagnosticRuns\s+IntegrationDiagnosticRun\[]/);
    expect(workspaceModel).toMatch(/integrationRunItems\s+IntegrationRunItem\[]/);
    expect(userModel).toMatch(/integrationDiagnosticRuns\s+IntegrationDiagnosticRun\[]/);
    expect(integrationModel).toMatch(/diagnosticRuns\s+IntegrationDiagnosticRun\[]/);
    expect(integrationRunModel).toMatch(/items\s+IntegrationRunItem\[]/);
    expect(conversationModel).toMatch(/integrationRunItems\s+IntegrationRunItem\[]/);

    expect(diagnosticRunModel).toContain("@@index([workspaceId, startedAt])");
    expect(diagnosticRunModel).toContain("@@index([workspaceId, status, startedAt])");
    expect(diagnosticRunModel).toContain("@@index([integrationId, startedAt])");
    expect(diagnosticRunModel).toMatch(/actor\s+User\?\s+@relation\(fields: \[actorId], references: \[id], onDelete: SetNull\)/);

    expect(diagnosticStepModel).toMatch(
      /diagnosticRun\s+IntegrationDiagnosticRun\s+@relation\(fields: \[diagnosticRunId], references: \[id], onDelete: Cascade\)/
    );
    expect(diagnosticStepModel).toContain("position        Int");
    expect(diagnosticStepModel).toContain("@@index([diagnosticRunId, createdAt])");
    expect(diagnosticStepModel).toContain("@@index([diagnosticRunId, position])");
    expect(diagnosticStepModel).toContain("@@unique([diagnosticRunId, position])");
    expect(diagnosticStepModel).toContain("@@unique([diagnosticRunId, key])");

    expect(runItemModel).toMatch(
      /integrationRun\s+IntegrationRun\?\s+@relation\(fields: \[integrationRunId], references: \[id], onDelete: SetNull\)/
    );
    expect(runItemModel).toMatch(
      /diagnosticRun\s+IntegrationDiagnosticRun\?\s+@relation\(fields: \[diagnosticRunId], references: \[id], onDelete: SetNull\)/
    );
    expect(runItemModel).toMatch(
      /conversation\s+Conversation\?\s+@relation\(fields: \[conversationId], references: \[id], onDelete: SetNull\)/
    );
    expect(runItemModel).toContain("@@index([workspaceId, createdAt])");
    expect(runItemModel).toContain("@@index([workspaceId, status, createdAt])");
    expect(runItemModel).toContain("@@index([integrationRunId, status])");
    expect(runItemModel).toContain("@@index([diagnosticRunId, status])");
    expect(runItemModel).toContain("@@index([conversationId])");
  });

  it("migrates integration diagnostics with foreign keys, hot-path indexes, and partial run item idempotency", () => {
    expect(diagnosticsMigrationName).toMatch(/^\d+_add_integration_diagnostics$/);
    expect(diagnosticsMigrationName?.localeCompare(credentialKindsMigrationName ?? "")).toBeGreaterThan(0);

    const expectedTables = [
      'CREATE TABLE "IntegrationDiagnosticRun"',
      'CREATE TABLE "IntegrationDiagnosticStep"',
      'CREATE TABLE "IntegrationRunItem"'
    ];

    for (const table of expectedTables) {
      expect(diagnosticsMigration).toContain(table);
    }

    const expectedForeignKeys = [
      'ALTER TABLE "IntegrationDiagnosticRun" ADD CONSTRAINT "IntegrationDiagnosticRun_workspaceId_fkey"',
      'ALTER TABLE "IntegrationDiagnosticRun" ADD CONSTRAINT "IntegrationDiagnosticRun_integrationId_fkey"',
      'ALTER TABLE "IntegrationDiagnosticRun" ADD CONSTRAINT "IntegrationDiagnosticRun_actorId_fkey"',
      'ALTER TABLE "IntegrationDiagnosticStep" ADD CONSTRAINT "IntegrationDiagnosticStep_diagnosticRunId_fkey"',
      'ALTER TABLE "IntegrationRunItem" ADD CONSTRAINT "IntegrationRunItem_workspaceId_fkey"',
      'ALTER TABLE "IntegrationRunItem" ADD CONSTRAINT "IntegrationRunItem_integrationRunId_fkey"',
      'ALTER TABLE "IntegrationRunItem" ADD CONSTRAINT "IntegrationRunItem_diagnosticRunId_fkey"',
      'ALTER TABLE "IntegrationRunItem" ADD CONSTRAINT "IntegrationRunItem_conversationId_fkey"'
    ];

    for (const foreignKey of expectedForeignKeys) {
      expect(diagnosticsMigration).toContain(foreignKey);
    }

    const expectedIndexes = [
      'CREATE INDEX "IntegrationDiagnosticRun_workspaceId_startedAt_idx"',
      'CREATE INDEX "IntegrationDiagnosticRun_workspaceId_status_startedAt_idx"',
      'CREATE INDEX "IntegrationDiagnosticRun_integrationId_startedAt_idx"',
      'CREATE INDEX "IntegrationDiagnosticStep_diagnosticRunId_createdAt_idx"',
      'CREATE INDEX "IntegrationDiagnosticStep_diagnosticRunId_position_idx"',
      'CREATE INDEX "IntegrationRunItem_workspaceId_createdAt_idx"',
      'CREATE INDEX "IntegrationRunItem_workspaceId_status_createdAt_idx"',
      'CREATE INDEX "IntegrationRunItem_integrationRunId_status_idx"',
      'CREATE INDEX "IntegrationRunItem_diagnosticRunId_status_idx"',
      'CREATE INDEX "IntegrationRunItem_conversationId_idx"'
    ];

    for (const index of expectedIndexes) {
      expect(diagnosticsMigration).toContain(index);
    }

    const expectedUniqueIndexes = [
      'CREATE UNIQUE INDEX "IntegrationDiagnosticStep_diagnosticRunId_position_key"',
      'CREATE UNIQUE INDEX "IntegrationDiagnosticStep_diagnosticRunId_key_key"',
      'CREATE UNIQUE INDEX "IntegrationRunItem_integrationRunId_externalId_key"'
    ];

    for (const index of expectedUniqueIndexes) {
      expect(diagnosticsMigration).toContain(index);
    }

    expect(diagnosticsMigration).toContain(
      'CREATE UNIQUE INDEX "IntegrationRunItem_integrationRunId_externalId_key"'
    );
    expect(diagnosticsMigration).toContain('ON "IntegrationRunItem"("integrationRunId", "externalId")');
    expect(diagnosticsMigration).toContain('WHERE "integrationRunId" IS NOT NULL');
  });

  it("migrates integration diagnostics with database guardrails for durations, counts, and run timing", () => {
    const expectedConstraints = [
      'CONSTRAINT "IntegrationDiagnosticRun_finishedAt_after_startedAt_chk" CHECK ("finishedAt" IS NULL OR "finishedAt" >= "startedAt")',
      'CONSTRAINT "IntegrationDiagnosticStep_durationMs_nonnegative_chk" CHECK ("durationMs" >= 0)',
      'CONSTRAINT "IntegrationRunItem_articleCount_nonnegative_chk" CHECK ("articleCount" >= 0)',
      'CONSTRAINT "IntegrationRunItem_privateArticleCount_nonnegative_chk" CHECK ("privateArticleCount" >= 0)',
      'CONSTRAINT "IntegrationRunItem_attachmentCount_nonnegative_chk" CHECK ("attachmentCount" >= 0)'
    ];

    for (const constraint of expectedConstraints) {
      expect(diagnosticsMigration).toContain(constraint);
    }
  });

  it("stores structured integration sync state and run progress", () => {
    const integrationModel = modelBlock("Integration");
    const integrationRunModel = modelBlock("IntegrationRun");

    expect(integrationModel).toMatch(/syncStateJson\s+String\s+@default\("\{\}"\)/);
    expect(integrationRunModel).toContain("checkedCount   Int                  @default(0)");
    expect(integrationRunModel).toContain("skippedCount   Int                  @default(0)");
    expect(integrationRunModel).toContain('cursorJson     String               @default("{}")');
    expect(integrationRunModel).toContain('checkpointJson String               @default("{}")');
  });

  it("migrates structured integration sync state with nonnegative progress guardrails", () => {
    expect(syncStateMigrationName).toMatch(/^\d+_add_integration_sync_state$/);
    expect(syncStateMigrationName?.localeCompare(diagnosticsMigrationName ?? "")).toBeGreaterThan(0);
    expect(syncStateMigration).toContain('ALTER TABLE "Integration"');
    expect(syncStateMigration).toContain('ADD COLUMN "syncStateJson" TEXT NOT NULL DEFAULT \'{}\'');
    expect(syncStateMigration).toContain('ADD COLUMN "checkedCount" INTEGER NOT NULL DEFAULT 0');
    expect(syncStateMigration).toContain('ADD COLUMN "skippedCount" INTEGER NOT NULL DEFAULT 0');
    expect(syncStateMigration).toContain('ADD COLUMN "cursorJson" TEXT NOT NULL DEFAULT \'{}\'');
    expect(syncStateMigration).toContain('ADD COLUMN "checkpointJson" TEXT NOT NULL DEFAULT \'{}\'');
    expect(syncStateMigration).toContain('CONSTRAINT "IntegrationRun_checkedCount_nonnegative_chk"');
    expect(syncStateMigration).toContain('CONSTRAINT "IntegrationRun_skippedCount_nonnegative_chk"');
  });

  it("stores inbound webhook endpoints and ingest events with idempotency", () => {
    const workspaceModel = modelBlock("Workspace");
    const integrationModel = modelBlock("Integration");
    const integrationRunModel = modelBlock("IntegrationRun");
    const conversationModel = modelBlock("Conversation");
    const endpointModel = modelBlock("WebhookEndpoint");
    const eventModel = modelBlock("WebhookIngestEvent");

    expect(schema).toContain("WEBHOOK_INGEST");
    expect(workspaceModel).toMatch(/webhookEndpoints\s+WebhookEndpoint\[]/);
    expect(workspaceModel).toMatch(/webhookIngestEvents\s+WebhookIngestEvent\[]/);
    expect(integrationModel).toMatch(/webhookEndpoints\s+WebhookEndpoint\[]/);
    expect(integrationRunModel).toMatch(/webhookEvents\s+WebhookIngestEvent\[]/);
    expect(conversationModel).toMatch(/webhookIngestEvents\s+WebhookIngestEvent\[]/);

    expect(endpointModel).toContain("encryptedSecret");
    expect(endpointModel).toMatch(/signingAlgorithm\s+String\s+@default\("hmac_sha256"\)/);
    expect(endpointModel).toContain("@@index([workspaceId, status])");
    expect(endpointModel).toContain("@@index([workspaceId, integrationId])");
    expect(eventModel).toMatch(/signatureVerified\s+Boolean\s+@default\(false\)/);
    expect(eventModel).toContain("@@unique([endpointId, idempotencyKey])");
    expect(eventModel).toContain("@@index([workspaceId, status, receivedAt])");
  });

  it("migrates inbound webhook ingest tables, indexes, and guardrails", () => {
    expect(webhookIngestMigrationName).toMatch(/^\d+_add_webhook_ingest$/);
    expect(webhookIngestMigrationName?.localeCompare(syncStateMigrationName ?? "")).toBeGreaterThan(0);
    expect(webhookIngestMigration).toContain("ALTER TYPE \"BackendJobType\" ADD VALUE 'WEBHOOK_INGEST'");
    expect(webhookIngestMigration).toContain('CREATE TABLE "WebhookEndpoint"');
    expect(webhookIngestMigration).toContain('CREATE TABLE "WebhookIngestEvent"');
    expect(webhookIngestMigration).toContain('CREATE UNIQUE INDEX "WebhookIngestEvent_endpointId_idempotencyKey_key"');
    expect(webhookIngestMigration).toContain('CONSTRAINT "WebhookEndpoint_status_chk"');
    expect(webhookIngestMigration).toContain('CONSTRAINT "WebhookIngestEvent_status_chk"');
    expect(webhookIngestMigration).toContain('ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_workspaceId_fkey"');
    expect(webhookIngestMigration).toContain('ALTER TABLE "WebhookIngestEvent" ADD CONSTRAINT "WebhookIngestEvent_endpointId_fkey"');
  });

  it("stores Phase C identity lifecycle, sync metadata, and provider-scoped group links", () => {
    const workspaceModel = modelBlock("Workspace");
    const userModel = modelBlock("User");
    const providerModel = modelBlock("IdentityProvider");
    const identityModel = modelBlock("ExternalIdentity");
    const groupModel = modelBlock("IdentityGroup");
    const userGroupModel = modelBlock("UserIdentityGroup");
    const mappingModel = modelBlock("GroupRoleMapping");
    const requestStateModel = modelBlock("SsoRequestState");

    expect(schema).toContain("enum UserLifecycleStatus");
    expect(userModel).toContain("lifecycleStatus             UserLifecycleStatus");
    expect(userModel).toContain("sourceOfTruthProviderId");
    expect(userModel).toContain("lastDirectorySyncAt");
    expect(userModel).toContain("@@index([workspaceId, lifecycleStatus])");
    expect(workspaceModel).toMatch(/identityGroups\s+IdentityGroup\[]/);
    expect(workspaceModel).toMatch(/ssoRequestStates\s+SsoRequestState\[]/);
    expect(providerModel).toContain("lastSyncStartedAt");
    expect(providerModel).toContain("samlCertificateRef");
    expect(providerModel).toContain("ldapsBindSecretRef");
    expect(providerModel).toContain("scimTokenPrefix");
    expect(providerModel).toMatch(/scimTokenHash\s+String\?\s+@unique/);
    expect(providerModel).toMatch(/identityGroups\s+IdentityGroup\[]/);
    expect(providerModel).toMatch(/ssoRequestStates\s+SsoRequestState\[]/);
    expect(identityModel).toContain("externalId");
    expect(identityModel).toContain("lastSyncAt");
    expect(userModel).toContain("@@unique([id, workspaceId])");
    expect(providerModel).toContain("@@unique([id, workspaceId])");
    expect(groupModel).toMatch(/provider\s+IdentityProvider\s+@relation\(fields: \[providerId, workspaceId], references: \[id, workspaceId], onDelete: Cascade\)/);
    expect(groupModel).toContain("@@unique([providerId, externalGroupId])");
    expect(groupModel).toContain("@@unique([providerId, externalGroupId, workspaceId])");
    expect(userGroupModel).toMatch(/user\s+User\s+@relation\(fields: \[userId, workspaceId], references: \[id, workspaceId], onDelete: Cascade\)/);
    expect(userGroupModel).toMatch(/provider\s+IdentityProvider\s+@relation\(fields: \[providerId, workspaceId], references: \[id, workspaceId], onDelete: Cascade\)/);
    expect(userGroupModel).toMatch(/group\s+IdentityGroup\?\s+@relation\(fields: \[providerId, externalGroupId, workspaceId], references: \[providerId, externalGroupId, workspaceId], onDelete: Cascade\)/);
    expect(userGroupModel).toContain("@@unique([userId, providerId, externalGroupId])");
    expect(mappingModel).toContain("@@unique([workspaceId, providerId, externalGroupId, role])");
    expect(requestStateModel).toContain("key         String");
    expect(requestStateModel).toMatch(/provider\s+IdentityProvider\s+@relation\(fields: \[providerId, workspaceId], references: \[id, workspaceId], onDelete: Cascade\)/);
    expect(requestStateModel).toMatch(/expiresAt\s+DateTime/);
    expect(requestStateModel).toMatch(/consumedAt\s+DateTime\?/);
    expect(requestStateModel).toContain("@@index([workspaceId, providerId, expiresAt])");
    expect(requestStateModel).toContain("@@index([providerId, consumedAt, expiresAt])");
  });

  it("migrates Phase C identity lifecycle without preserving cross-provider group mapping collisions", () => {
    expect(identityLifecycleMigrationName).toMatch(/^\d+_phase_c_identity_lifecycle$/);
    expect(identityLifecycleMigrationName?.localeCompare(webhookIngestMigrationName ?? "")).toBeGreaterThan(0);
    expect(identityLifecycleMigration).toContain('CREATE TYPE "UserLifecycleStatus"');
    expect(identityLifecycleMigration).toContain('ADD COLUMN "lifecycleStatus" "UserLifecycleStatus" NOT NULL DEFAULT \'ACTIVE\'');
    expect(identityLifecycleMigration).toContain('CREATE TABLE "IdentityGroup"');
    expect(identityLifecycleMigration).toContain('CREATE TABLE "UserIdentityGroup"');
    expect(identityLifecycleMigration).toContain('CREATE UNIQUE INDEX "User_id_workspaceId_key" ON "User"("id", "workspaceId")');
    expect(identityLifecycleMigration).toContain(
      'CREATE UNIQUE INDEX "IdentityGroup_providerId_externalGroupId_workspaceId_key" ON "IdentityGroup"("providerId", "externalGroupId", "workspaceId")'
    );
    expect(identityLifecycleMigration).toContain('DROP INDEX "GroupRoleMapping_workspaceId_externalGroupId_role_key"');
    expect(identityLifecycleMigration).toContain(
      'CREATE UNIQUE INDEX "GroupRoleMapping_workspaceId_providerId_externalGroupId_role_key" ON "GroupRoleMapping"("workspaceId", "providerId", "externalGroupId", "role")'
    );
    expect(identityLifecycleMigration).toContain(
      'CREATE UNIQUE INDEX "GroupRoleMapping_workspaceId_externalGroupId_role_global_key" ON "GroupRoleMapping"("workspaceId", "externalGroupId", "role") WHERE "providerId" IS NULL'
    );
    expect(identityLifecycleMigration).toContain('ALTER TABLE "User" ADD CONSTRAINT "User_sourceOfTruthProviderId_fkey"');
    expect(identityLifecycleMigration).toContain(
      'ALTER TABLE "UserIdentityGroup" ADD CONSTRAINT "UserIdentityGroup_providerId_externalGroupId_workspaceId_fkey"'
    );
  });

  it("migrates persistent SAML request state for InResponseTo replay protection", () => {
    expect(samlRequestStateMigrationName).toMatch(/^\d+_phase_c_saml_request_state$/);
    expect(samlRequestStateMigrationName?.localeCompare(identityLifecycleMigrationName ?? "")).toBeGreaterThan(0);
    expect(samlRequestStateMigration).toContain('CREATE TABLE "SsoRequestState"');
    expect(samlRequestStateMigration).toContain('"consumedAt" TIMESTAMP(3)');
    expect(samlRequestStateMigration).toContain('CONSTRAINT "SsoRequestState_pkey" PRIMARY KEY ("key")');
    expect(samlRequestStateMigration).toContain('CREATE INDEX "SsoRequestState_workspaceId_providerId_expiresAt_idx"');
    expect(samlRequestStateMigration).toContain('CREATE INDEX "SsoRequestState_providerId_consumedAt_expiresAt_idx"');
    expect(samlRequestStateMigration).toContain('ALTER TABLE "SsoRequestState" ADD CONSTRAINT "SsoRequestState_providerId_fkey"');
  });

  it("tightens persistent SSO request state to provider/workspace composite integrity", () => {
    expect(ssoRequestStateCompositeFkMigrationName).toMatch(/^\d+_phase_c_sso_request_state_composite_fk$/);
    expect(ssoRequestStateCompositeFkMigrationName?.localeCompare(samlRequestStateMigrationName ?? "")).toBeGreaterThan(0);
    expect(ssoRequestStateCompositeFkMigration).toContain('DELETE FROM "SsoRequestState" state');
    expect(ssoRequestStateCompositeFkMigration).toContain('DROP CONSTRAINT "SsoRequestState_providerId_fkey"');
    expect(ssoRequestStateCompositeFkMigration).toContain(
      'ADD CONSTRAINT "SsoRequestState_providerId_workspaceId_fkey"'
    );
    expect(ssoRequestStateCompositeFkMigration).toContain('FOREIGN KEY ("providerId", "workspaceId")');
    expect(ssoRequestStateCompositeFkMigration).toContain('REFERENCES "IdentityProvider"("id", "workspaceId")');
  });

  it("stores Phase D live certification evidence as a dedicated redacted ledger", () => {
    const workspaceModel = modelBlock("Workspace");
    const userModel = modelBlock("User");
    const providerModel = modelBlock("IdentityProvider");
    const integrationModel = modelBlock("Integration");
    const evidenceModel = modelBlock("CertificationEvidence");

    expect(workspaceModel).toMatch(/certificationEvidence\s+CertificationEvidence\[]/);
    expect(userModel).toMatch(/certificationEvidence\s+CertificationEvidence\[]/);
    expect(providerModel).toMatch(/certificationEvidence\s+CertificationEvidence\[]/);
    expect(integrationModel).toMatch(/certificationEvidence\s+CertificationEvidence\[]/);
    expect(evidenceModel).toContain("targetType              String");
    expect(evidenceModel).toContain("source                  String");
    expect(evidenceModel).toContain("provider                String?");
    expect(evidenceModel).toContain("runId                   String");
    expect(evidenceModel).toContain("actorId                 String?");
    expect(evidenceModel).toContain("envGate                 String");
    expect(evidenceModel).toContain("result                  String");
    expect(evidenceModel).toContain('redactedDiagnosticsJson String            @default("{}")');
    expect(evidenceModel).toContain("recordedAt              DateTime          @default(now())");
    expect(evidenceModel).toContain("@@index([workspaceId, targetType, source, recordedAt])");
    expect(evidenceModel).toContain("@@index([workspaceId, result, recordedAt])");
  });

  it("migrates Phase D certification evidence with foreign keys and query indexes", () => {
    expect(certificationEvidenceMigrationName).toMatch(/^\d+_phase_d_certification_evidence$/);
    expect(certificationEvidenceMigrationName?.localeCompare(ssoRequestStateCompositeFkMigrationName ?? "")).toBeGreaterThan(0);
    expect(certificationEvidenceMigration).toContain('CREATE TABLE "CertificationEvidence"');
    expect(certificationEvidenceMigration).toContain('"redactedDiagnosticsJson" TEXT NOT NULL DEFAULT \'{}\'');
    expect(certificationEvidenceMigration).toContain('CREATE INDEX "CertificationEvidence_workspaceId_targetType_source_recordedAt_idx"');
    expect(certificationEvidenceMigration).toContain('CREATE INDEX "CertificationEvidence_workspaceId_result_recordedAt_idx"');
    expect(certificationEvidenceMigration).toContain('ALTER TABLE "CertificationEvidence"');
    expect(certificationEvidenceMigration).toContain('ADD CONSTRAINT "CertificationEvidence_workspaceId_fkey"');
    expect(certificationEvidenceMigration).toContain('ADD CONSTRAINT "CertificationEvidence_integrationId_fkey"');
    expect(certificationEvidenceMigration).toContain('ADD CONSTRAINT "CertificationEvidence_identityProviderId_fkey"');
    expect(certificationEvidenceMigration).toContain('ADD CONSTRAINT "CertificationEvidence_actorId_fkey"');
  });
});
