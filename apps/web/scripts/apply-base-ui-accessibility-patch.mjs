// The published Base UI 1.9 VoiceOver guard has role=button without a name.
// Keep the native focus mechanism and give its exposed button an actual name.
// A source-specific patch uses only Node built-ins: patch-package currently
// reintroduces the unpatched braces High advisory GHSA-vfj7-8cjw-p6xm.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const metadataPath = require.resolve("@base-ui/react/package.json");
const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
if (metadata.version !== "1.9.0") {
  throw new Error("Review the Base UI accessibility patch before changing version 1.9.0.");
}
const files = [
  {
    "file": "utils/FocusGuard.js",
    "original": "991f88bc79588c44258f1e6c79909689509410ff1e76a948954bde1eeccabfc4",
    "patched": "29f0c5af813ffb4d815da966d24db687def163dc6a5212ebb8b1b29e0d822f35"
  },
  {
    "file": "utils/FocusGuard.mjs",
    "original": "71008da16b80cecacf2a55c0108e3aa1e2b1cebdac8ede05b8aa6c9cdcad3aac",
    "patched": "25894ce8f5a2cef9189bea4e334684349b2d42d76ef3310f4652899a2bed13aa"
  }
];
const anchor = '    "aria-hidden": role ? undefined : true,\n';
const label = '    "aria-label": role ? "Продолжить навигацию" : undefined,\n';
const hash = (source) => createHash("sha256").update(source).digest("hex");
// Validate every published artifact before modifying either module format.
const updates = files.map(({ file, original, patched }) => {
  const path = join(dirname(metadataPath), file);
  const source = readFileSync(path, "utf8");
  const digest = hash(source);
  if (digest === patched) return null;
  if (digest !== original) throw new Error(`Unexpected Base UI source: ${file}. Review the accessibility patch.`);
  const updated = source.replace(anchor, anchor + label);
  if (hash(updated) !== patched) throw new Error(`Invalid Base UI accessibility patch: ${file}.`);
  return { path, updated };
});
for (const update of updates) if (update) writeFileSync(update.path, update.updated);
console.log("Base UI VoiceOver focus guard labels verified (CJS and ESM).");
