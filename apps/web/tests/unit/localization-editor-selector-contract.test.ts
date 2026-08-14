import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const localizationEditorE2ESource = readFileSync(
  join(process.cwd(), "tests/e2e/localization-editor.spec.ts"),
  "utf8"
);

describe("localization editor E2E selector contract", () => {
  it("does not target the removed native details summary", () => {
    expect(localizationEditorE2ESource).not.toMatch(/\.locator\(["']summary["']\)/);
  });

  it("does not target the removed legacy pill class", () => {
    expect(localizationEditorE2ESource).not.toMatch(/\.locator\(["']\.pill["']\)/);
  });

  it("does not assume the current admin route remains a link", () => {
    expect(localizationEditorE2ESource).not.toMatch(
      /\.getByRole\(["']link["'], \{ name: ["']Локализация["'] \}\)/
    );
  });
});
