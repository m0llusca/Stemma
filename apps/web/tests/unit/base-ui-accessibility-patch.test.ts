import { afterEach, describe, expect, it } from "vitest";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const temporaryRoots: string[] = [];
const label = '    "aria-label": role ? "Продолжить навигацию" : undefined,\n';

function fixture(version = "1.9.0") {
  const root = mkdtempSync(join(tmpdir(), "stemma-baseui-labels-"));
  temporaryRoots.push(root);
  const directory = join(root, "node_modules/@base-ui/react");
  mkdirSync(join(directory, "utils"), { recursive: true });
  mkdirSync(join(root, "scripts"));
  writeFileSync(join(directory, "package.json"), JSON.stringify({ name: "@base-ui/react", version }));
  const files = ["js", "mjs"].map((extension) => {
    const path = join(directory, `utils/FocusGuard.${extension}`);
    // Use the real published modules: no synthetic match can hide a changed
    // upstream artifact or an accidental mismatch between CJS and ESM.
    const original = readFileSync(join(process.cwd(), `node_modules/@base-ui/react/utils/FocusGuard.${extension}`), "utf8").replace(label, "");
    writeFileSync(path, original);
    return { path, original };
  });
  const script = join(root, "scripts/apply-base-ui-accessibility-patch.mjs");
  copyFileSync(join(process.cwd(), "scripts/apply-base-ui-accessibility-patch.mjs"), script);
  return { files, run: () => spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" }) };
}

afterEach(() => { for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("pinned Base UI accessibility patch", () => {
  it("names both published module formats and verifies already-patched installs without rewriting", () => {
    const { files, run } = fixture();
    expect(run().status).toBe(0);
    for (const file of files) expect(readFileSync(file.path, "utf8")).toBe(file.original.replace('    "aria-hidden": role ? undefined : true,\n', '    "aria-hidden": role ? undefined : true,\n' + label));
    const timestamps = files.map((file) => statSync(file.path).mtimeMs);
    expect(run().status).toBe(0);
    expect(files.map((file) => statSync(file.path).mtimeMs)).toEqual(timestamps);
  });

  it("rejects a changed artifact before patching the other module", () => {
    const { files, run } = fixture();
    writeFileSync(files[1].path, files[1].original + "\n// unexpected upstream source\n");
    const result = run();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Unexpected Base UI source");
    expect(readFileSync(files[0].path, "utf8")).toBe(files[0].original);
  });

  it("requires an explicit review when the pinned dependency version changes", () => {
    const { files, run } = fixture("1.9.1");
    const result = run();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("before changing version 1.9.0");
    for (const file of files) expect(readFileSync(file.path, "utf8")).toBe(file.original);
  });
});
