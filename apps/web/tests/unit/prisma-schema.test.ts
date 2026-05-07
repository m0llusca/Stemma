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
});
