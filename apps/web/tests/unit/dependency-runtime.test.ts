import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfigFromFile } from "@prisma/config";
import sharp from "sharp";

describe("patched dependency runtime", () => {
  it("loads a Prisma config through the overridden deepmerge-ts dependency", async () => {
    const configRoot = await mkdtemp(join(tmpdir(), "stemma-prisma-config-"));
    try {
      const configFile = join(configRoot, "prisma.config.mjs");
      await writeFile(configFile, 'export default { schema: "./schema.prisma", migrations: { path: "./migrations" } };');
      const result = await loadConfigFromFile({ configRoot, configFile });
      expect(result.error).toBeUndefined();
      expect(result.config?.schema).toBe(join(configRoot, "schema.prisma"));
      expect(result.config?.migrations?.path).toBe(join(configRoot, "migrations"));
    } finally {
      await rm(configRoot, { recursive: true, force: true });
    }
  });

  it("decodes SVG and encodes PNG with the patched Sharp native dependency", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="6"><rect width="8" height="6" fill="red"/></svg>');
    const result = await sharp(svg).png().toBuffer({ resolveWithObject: true });
    expect(result.info).toMatchObject({ format: "png", width: 8, height: 6 });
    expect(result.data.subarray(1, 4).toString()).toBe("PNG");
  });
});
