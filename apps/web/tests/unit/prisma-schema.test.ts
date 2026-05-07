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
});
