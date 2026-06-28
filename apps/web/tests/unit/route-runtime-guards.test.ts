import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(testDir, "../..");

const guardedFiles = [
  "src/app/page.tsx",
  "src/app/auth/login/page.tsx",
  "src/app/dashboard/page.tsx",
  "src/app/reviews/page.tsx",
  "src/app/coaching/page.tsx",
  "src/app/reports/page.tsx",
  "src/app/admin/integrations/page.tsx",
  "src/app/api/v1/reports/exports/route.ts",
  "src/app/api/v1/auth/providers/[providerId]/sync/route.ts",
  "src/app/api/v1/jobs/route.ts",
  "src/lib/system-enqueue-actions.ts",
  "src/lib/jobs/enqueue.ts"
] as const;

const disallowedRuntimeReferences = [
  "ldapts",
  "@/lib/auth/ldaps",
  "@/lib/auth/directory-sync",
  "@/lib/jobs/queue",
  "@/lib/integrations/helpdesk-adapters",
  "@/lib/integrations/otrs-family/client",
  "@/lib/integrations/data-source-adapters",
  "@/lib/certification/runs",
  "@/lib/messaging/delivery"
] as const;

describe("lightweight route runtime guards", () => {
  it.each(guardedFiles)("keeps %s free of heavy shell runtime imports", async (filePath) => {
    const source = await readFile(path.join(webRoot, filePath), "utf8");

    for (const disallowedReference of disallowedRuntimeReferences) {
      expect(source, `${filePath} must not reference ${disallowedReference}`).not.toContain(disallowedReference);
    }
  });
});
