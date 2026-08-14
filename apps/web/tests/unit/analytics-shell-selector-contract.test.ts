import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const analyticsShellLayoutSource = readFileSync(
  join(process.cwd(), "tests/e2e/analytics-shell-layout.spec.ts"),
  "utf8"
);

describe("analytics shell selector contract", () => {
  it("does not locate owners through XPath parent or ancestor traversal", () => {
    expect(analyticsShellLayoutSource).not.toMatch(/\.locator\(["']xpath=/);
  });

  it("does not locate owners through anonymous parent depth", () => {
    expect(analyticsShellLayoutSource).not.toMatch(/\.locator\(["']\.\.["']\)/);
  });
});
