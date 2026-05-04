import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const hardeningMigration = readFileSync(
  join(process.cwd(), "prisma/migrations/20260504120500_harden_database_foundation/migration.sql"),
  "utf8"
);

describe("prisma schema database foundations", () => {
  it("keeps evidence and calibration baseline references as database foreign keys", () => {
    expect(schema).toMatch(
      /evidenceMessage\s+Message\?\s+@relation\("CriterionScoreEvidenceMessage", fields: \[evidenceMessageId], references: \[id], onDelete: SetNull\)/
    );
    expect(schema).toMatch(
      /baselineReview\s+Review\?\s+@relation\("CalibrationBaselineReview", fields: \[baselineReviewId], references: \[id], onDelete: SetNull\)/
    );
    expect(hardeningMigration).toContain(
      'CONSTRAINT "CriterionScore_evidenceMessageId_fkey" FOREIGN KEY ("evidenceMessageId") REFERENCES "Message" ("id") ON DELETE SET NULL ON UPDATE CASCADE'
    );
    expect(hardeningMigration).toContain(
      'CONSTRAINT "CalibrationSessionItem_baselineReviewId_fkey" FOREIGN KEY ("baselineReviewId") REFERENCES "Review" ("id") ON DELETE SET NULL ON UPDATE CASCADE'
    );
  });

  it("keeps versioned scorecards unique within a workspace", () => {
    expect(schema).toContain("@@unique([workspaceId, version])");
    expect(hardeningMigration).toContain('CREATE UNIQUE INDEX "Scorecard_workspaceId_version_key" ON "Scorecard"("workspaceId", "version")');
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
      expect(hardeningMigration).toContain(index);
    }
  });
});
