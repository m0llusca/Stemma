import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};
const vitestConfig = readFileSync(join(process.cwd(), "vitest.config.ts"), "utf8");
const helpdeskLiveSmoke = readFileSync(join(process.cwd(), "tests/live/helpdesk-live-smoke.test.ts"), "utf8");
const identityLiveSmoke = readFileSync(join(process.cwd(), "tests/live/identity-live-smoke.test.ts"), "utf8");

describe("Phase D live smoke harness", () => {
  it("keeps live tests out of default unit runs", () => {
    expect(vitestConfig).toContain('process.env.VITEST_INCLUDE_LIVE === "1"');
    expect(vitestConfig).toContain('"tests/live/**"');
    expect(packageJson.scripts.test).toBe("vitest run");
  });

  it("requires provider-specific protected flags in live smoke files", () => {
    expect(packageJson.scripts["test:live:helpdesk"]).toContain("VITEST_INCLUDE_LIVE=1");
    expect(packageJson.scripts["test:live:helpdesk"]).not.toContain("HELPDESK_LIVE_SMOKE=1");
    expect(packageJson.scripts["test:live:identity"]).toContain("VITEST_INCLUDE_LIVE=1");
    expect(packageJson.scripts["test:live:identity"]).not.toContain("IDENTITY_LIVE_SMOKE=1");
    expect(helpdeskLiveSmoke).toContain('process.env.HELPDESK_LIVE_SMOKE === "1"');
    expect(identityLiveSmoke).toContain('process.env.IDENTITY_LIVE_SMOKE === "1"');
  });
});
