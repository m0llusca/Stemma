import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(testDir, "../..");

const guardedFiles = [
  "src/app/api/v1/reports/exports/route.ts",
  "src/app/api/v1/auth/providers/[providerId]/sync/route.ts",
  "src/app/api/v1/jobs/route.ts",
  "src/lib/system-enqueue-actions.ts"
] as const;

const disallowedRuntimeReferences = [
  "@/lib/auth/ldaps",
  "@/lib/auth/directory-sync",
  "@/lib/jobs/queue",
  "ldapts"
] as const;

describe("lightweight route runtime guards", () => {
  it.each(guardedFiles)("keeps %s free of heavy LDAP and worker runtime imports", async (filePath) => {
    const source = await readFile(path.join(webRoot, filePath), "utf8");

    for (const disallowedReference of disallowedRuntimeReferences) {
      expect(source, `${filePath} must not reference ${disallowedReference}`).not.toContain(disallowedReference);
    }
  });
});
