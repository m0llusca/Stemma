import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

describe("localization Prisma schema contract", () => {
  it("defines workspace-aware locales, translation keys, values and audit", () => {
    expect(schema).toContain("model Locale");
    expect(schema).toContain("model TranslationKey");
    expect(schema).toContain("model TranslationValue");
    expect(schema).toContain("model TranslationAudit");
    expect(schema).toContain("@@unique([workspaceId, code])");
    expect(schema).toContain("@@unique([namespace, key])");
    expect(schema).toContain("@@unique([workspaceId, localeId, keyId])");
  });
});
