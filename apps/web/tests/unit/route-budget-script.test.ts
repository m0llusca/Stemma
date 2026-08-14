import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = resolve(process.cwd(), "scripts/verify-route-budgets.mjs");
const RICH_EXPORTS = [
  "QualityTrendVisual",
  "RankedDriverVisual",
  "ScoreDistributionVisual",
  "PairedAiDriftVisual",
  "ReasonTrendVisual",
  "RankedBreakdownVisual"
] as const;

function deterministicNoise(size: number) {
  const output = Buffer.alloc(size);
  let value = 0x12345678;

  for (let index = 0; index < size; index += 1) {
    value = (value * 1664525 + 1013904223) >>> 0;
    output[index] = value >>> 24;
  }

  return output;
}

function bytesWithGzipLength(targetBytes: number) {
  for (
    let size = Math.max(0, targetBytes - 128);
    size <= targetBytes + 128;
    size += 1
  ) {
    const candidate = deterministicNoise(size);
    if (gzipSync(candidate, { level: 9 }).length === targetBytes) {
      return candidate;
    }
  }
  throw new Error(`Could not synthesize gzip length ${targetBytes}`);
}

function writeRouteManifest(
  nextDir: string,
  route: "reports" | "dashboard" | "coaching",
  chunks: string[]
) {
  const manifestPath = join(
    nextDir,
    "server",
    "app",
    route,
    "page_client-reference-manifest.js"
  );
  mkdirSync(dirname(manifestPath), { recursive: true });
  const manifest = {
    moduleLoading: { prefix: "", crossOrigin: null },
    clientModules: {
      shared: { id: "shared", name: "*", chunks: [chunks[0]], async: false },
      route: { id: route, name: "*", chunks: chunks.slice(1), async: false }
    },
    ssrModuleMapping: {},
    edgeSSRModuleMapping: {},
    rscModuleMapping: {},
    edgeRscModuleMapping: {},
    entryCSSFiles: {},
    entryJSFiles: {}
  };
  writeFileSync(
    manifestPath,
    `globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};\n` +
      `globalThis.__RSC_MANIFEST["/${route}/page"] = ${JSON.stringify(manifest)};\n`
  );
}

function writeChunk(nextDir: string, relativePath: string, body: Buffer | string) {
  const chunkPath = join(nextDir, relativePath);
  mkdirSync(dirname(chunkPath), { recursive: true });
  writeFileSync(chunkPath, body);
  return relativePath;
}

function richExportSource(exports: readonly string[], size = 0) {
  return Buffer.concat([
    Buffer.from(
      `${exports.map((name) => `export const ${name} = "${name}";`).join("\n")}\n` +
        'export const marker = "recharts-surface";\n'
    ),
    deterministicNoise(size)
  ]);
}

function chunkWithDependencies(dependencies: string[], body: Buffer | string = "") {
  return Buffer.concat([
    Buffer.from(
      `globalThis.TURBOPACK.push([null,{otherChunks:${JSON.stringify(
        dependencies
      )},runtimeModuleIds:[]}]);\n`
    ),
    Buffer.isBuffer(body) ? body : Buffer.from(body)
  ]);
}

function writeDeferredRichChart(nextDir: string, size = 4 * 1024) {
  const relativePath = "static/chunks/deferred-rich-chart.js";
  writeChunk(nextDir, relativePath, richExportSource(RICH_EXPORTS, size));
  return relativePath;
}

function writeRichLoaderMetadata(
  nextDir: string,
  target = "static/chunks/deferred-rich-chart.js",
  loaderBody?: string
) {
  const moduleId = 900001;
  const usages = RICH_EXPORTS.map(
    (name) => `void (await e.A(${moduleId})).${name};`
  ).join("\n");
  const body =
    loaderBody ??
    `e.v(t=>Promise.all([${JSON.stringify(
      target
    )}].map(t=>e.l(t))).then(()=>t(101)))`;
  writeChunk(
    nextDir,
    "static/chunks/rich-loaders.js",
    `${usages}\n,${moduleId},e=>{${body}}\n`
  );
}

function syntheticBuild() {
  const root = mkdtempSync(join(tmpdir(), "route-budget-"));
  const nextDir = join(root, ".next");
  const chunks = {
    shared: "static/chunks/shared.js",
    reports: "static/chunks/reports.js",
    dashboard: "static/chunks/dashboard.js",
    coaching: "static/chunks/coaching.js"
  };

  for (const [name, relativePath] of Object.entries(chunks)) {
    const chunkPath = join(nextDir, relativePath);
    mkdirSync(dirname(chunkPath), { recursive: true });
    writeFileSync(chunkPath, `export const route = ${JSON.stringify(name)};\n`);
  }

  writeRouteManifest(nextDir, "reports", [chunks.shared, chunks.reports]);
  writeRouteManifest(nextDir, "dashboard", [chunks.shared, chunks.dashboard]);
  writeRouteManifest(nextDir, "coaching", [chunks.shared, chunks.coaching]);
  writeDeferredRichChart(nextDir);
  writeRichLoaderMetadata(nextDir);

  return { root, nextDir, chunks };
}

function capture(build: ReturnType<typeof syntheticBuild>) {
  const reportPath = join(build.root, "measurement.json");
  execFileSync(
    process.execPath,
    [SCRIPT, "--next-dir", build.nextDir, "--capture-baseline", reportPath],
    { encoding: "utf8" }
  );
  return JSON.parse(readFileSync(reportPath, "utf8"));
}

describe("verify-route-budgets", () => {
  it("captures gzip union, shared, and route-specific bytes from client manifests", () => {
    const build = syntheticBuild();
    const baselinePath = join(build.root, "baseline.json");

    execFileSync(
      process.execPath,
      [SCRIPT, "--next-dir", build.nextDir, "--capture-baseline", baselinePath],
      { encoding: "utf8" }
    );

    const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as {
      sharedGzipBytes: number;
      routes: Record<string, { unionGzipBytes: number; routeSpecificGzipBytes: number }>;
    };
    const sharedBytes = gzipSync(
      readFileSync(join(build.nextDir, build.chunks.shared))
    ).length;
    const reportsBytes = gzipSync(
      readFileSync(join(build.nextDir, build.chunks.reports))
    ).length;

    expect(baseline.sharedGzipBytes).toBe(sharedBytes);
    expect(baseline.routes.reports).toEqual({
      unionGzipBytes: sharedBytes + reportsBytes,
      routeSpecificGzipBytes: reportsBytes
    });
  });

  it("hard-fails when the reports union grows by more than 45 KiB", () => {
    const build = syntheticBuild();
    const baselinePath = join(build.root, "baseline.json");

    execFileSync(
      process.execPath,
      [SCRIPT, "--next-dir", build.nextDir, "--capture-baseline", baselinePath],
      { encoding: "utf8" }
    );
    writeFileSync(
      join(build.nextDir, build.chunks.reports),
      deterministicNoise(80 * 1024)
    );

    const result = spawnSync(
      process.execPath,
      [SCRIPT, "--next-dir", build.nextDir, "--baseline", baselinePath],
      { encoding: "utf8" }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/reports.+45 KiB/is);
  });

  it("allows shared at its zero-byte delta and fails at plus one byte", () => {
    const build = syntheticBuild();
    const baselinePath = join(build.root, "baseline.json");
    execFileSync(
      process.execPath,
      [SCRIPT, "--next-dir", build.nextDir, "--capture-baseline", baselinePath],
      { encoding: "utf8" }
    );

    const atLimit = spawnSync(
      process.execPath,
      [SCRIPT, "--next-dir", build.nextDir, "--baseline", baselinePath],
      { encoding: "utf8" }
    );
    expect(atLimit.status).toBe(0);

    const sharedPath = join(build.nextDir, build.chunks.shared);
    const baselineGzip = gzipSync(readFileSync(sharedPath), { level: 9 }).length;
    writeFileSync(sharedPath, bytesWithGzipLength(baselineGzip + 1));
    const plusOne = spawnSync(
      process.execPath,
      [SCRIPT, "--next-dir", build.nextDir, "--baseline", baselinePath],
      { encoding: "utf8" }
    );

    expect(plusOne.status).toBe(1);
    expect(plusOne.stderr).toMatch(/shared grew by 1 byte/is);
  });

  it.each([
    ["dashboard", 10 * 1024],
    ["coaching", 10 * 1024]
  ] as const)(
    "allows %s at its hard delta and fails at plus one byte",
    (route, hardDelta) => {
      const build = syntheticBuild();
      const baselinePath = join(build.root, "baseline.json");
      execFileSync(
        process.execPath,
        [SCRIPT, "--next-dir", build.nextDir, "--capture-baseline", baselinePath],
        { encoding: "utf8" }
      );
      const chunkPath = join(build.nextDir, build.chunks[route]);
      const baselineGzip = gzipSync(readFileSync(chunkPath), {
        level: 9
      }).length;

      writeFileSync(
        chunkPath,
        bytesWithGzipLength(baselineGzip + hardDelta)
      );
      const atLimit = spawnSync(
        process.execPath,
        [SCRIPT, "--next-dir", build.nextDir, "--baseline", baselinePath],
        { encoding: "utf8" }
      );
      expect(atLimit.status).toBe(0);

      writeFileSync(
        chunkPath,
        bytesWithGzipLength(baselineGzip + hardDelta + 1)
      );
      const plusOne = spawnSync(
        process.execPath,
        [SCRIPT, "--next-dir", build.nextDir, "--baseline", baselinePath],
        { encoding: "utf8" }
      );

      expect(plusOne.status).toBe(1);
      expect(plusOne.stderr).toMatch(
        new RegExp(`${route} grew by ${hardDelta + 1} bytes`, "is")
      );
    }
  );

  it("measures and hard-fails rich chart chunks above 70 KiB gzip", () => {
    const build = syntheticBuild();
    const baselinePath = join(build.root, "baseline.json");

    writeDeferredRichChart(build.nextDir, 80 * 1024);
    execFileSync(
      process.execPath,
      [SCRIPT, "--next-dir", build.nextDir, "--capture-baseline", baselinePath],
      { encoding: "utf8" }
    );

    const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as {
      deferredRichChartGzipBytes: number;
    };
    expect(baseline.deferredRichChartGzipBytes).toBeGreaterThan(70 * 1024);

    const result = spawnSync(
      process.execPath,
      [SCRIPT, "--next-dir", build.nextDir, "--baseline", baselinePath],
      { encoding: "utf8" }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/deferred rich-chart.+70 KiB/is);
  });

  it("resolves all six literal rich-export load sites to the shared renderer target", () => {
    const build = syntheticBuild();
    writeChunk(
      build.nextDir,
      "static/chunks/decoy-rich-export.js",
      richExportSource(RICH_EXPORTS)
    );
    const measurement = capture(build) as {
      richDynamicTargets: Array<{
        source: string;
        specifier: string;
        export: string;
        seedChunks: string[];
      }>;
    };

    expect(measurement.richDynamicTargets).toHaveLength(6);
    expect(measurement.richDynamicTargets.map((target) => target.export).sort()).toEqual(
      [...RICH_EXPORTS].sort()
    );
    expect(
      new Set(measurement.richDynamicTargets.map((target) => target.specifier))
    ).toEqual(new Set(["@/components/charts/recharts-visuals.client"]));
    expect(
      measurement.richDynamicTargets.every(
        (target) =>
          target.source.startsWith("src/components/charts/") &&
          target.seedChunks.length === 1 &&
          target.seedChunks[0] === "static/chunks/deferred-rich-chart.js"
      )
    ).toBe(true);
  });

  it("pulls transitive dependencies from every signature-bearing rich seed", () => {
    const build = syntheticBuild();
    writeChunk(
      build.nextDir,
      "static/chunks/deferred-rich-chart.js",
      chunkWithDependencies(
        ["static/chunks/recharts-runtime.js"],
        richExportSource(RICH_EXPORTS.slice(0, 3))
      )
    );
    writeChunk(
      build.nextDir,
      "static/chunks/second-rich-seed.js",
      chunkWithDependencies(
        ["static/chunks/recharts-runtime.js"],
        richExportSource(RICH_EXPORTS.slice(3))
      )
    );
    writeRichLoaderMetadata(
      build.nextDir,
      "static/chunks/deferred-rich-chart.js",
      `e.v(t=>Promise.all(["static/chunks/deferred-rich-chart.js","static/chunks/second-rich-seed.js"].map(t=>e.l(t))).then(()=>t(101)))`
    );
    writeChunk(
      build.nextDir,
      "static/chunks/recharts-runtime.js",
      chunkWithDependencies(
        ["static/chunks/shared-helper.js"],
        "export const runtime = 1;"
      )
    );
    writeChunk(
      build.nextDir,
      "static/chunks/shared-helper.js",
      "export const helper = 1;"
    );

    const measurement = capture(build) as {
      deferredRichChartReachableChunks: Array<{ path: string }>;
      deferredRichChartEdges: Array<{ from: string; to: string }>;
    };

    expect(
      measurement.deferredRichChartReachableChunks.map((chunk) => chunk.path).sort()
    ).toEqual(
      [
        "static/chunks/deferred-rich-chart.js",
        "static/chunks/recharts-runtime.js",
        "static/chunks/second-rich-seed.js",
        "static/chunks/shared-helper.js"
      ].sort()
    );
    expect(measurement.deferredRichChartEdges).toContainEqual({
      from: "static/chunks/recharts-runtime.js",
      to: "static/chunks/shared-helper.js"
    });
  });

  it("counts a transitive dependency shared by rich seeds exactly once", () => {
    const build = syntheticBuild();
    const sharedRuntime = deterministicNoise(9 * 1024);
    writeChunk(
      build.nextDir,
      "static/chunks/deferred-rich-chart.js",
      chunkWithDependencies(
        ["static/chunks/recharts-runtime.js"],
        richExportSource(RICH_EXPORTS.slice(0, 3))
      )
    );
    writeChunk(
      build.nextDir,
      "static/chunks/second-rich-seed.js",
      chunkWithDependencies(
        ["static/chunks/recharts-runtime.js"],
        richExportSource(RICH_EXPORTS.slice(3))
      )
    );
    writeRichLoaderMetadata(
      build.nextDir,
      "static/chunks/deferred-rich-chart.js",
      `e.v(t=>Promise.all(["static/chunks/deferred-rich-chart.js","static/chunks/second-rich-seed.js"].map(t=>e.l(t))).then(()=>t(101)))`
    );
    writeChunk(
      build.nextDir,
      "static/chunks/recharts-runtime.js",
      sharedRuntime
    );

    const measurement = capture(build) as {
      deferredRichChartReachableChunks: Array<{ path: string; gzipBytes: number }>;
      deferredRichChartGzipBytes: number;
    };
    const inventoryTotal = measurement.deferredRichChartReachableChunks.reduce(
      (sum, chunk) => sum + chunk.gzipBytes,
      0
    );

    expect(
      measurement.deferredRichChartReachableChunks.filter(
        (chunk) => chunk.path === "static/chunks/recharts-runtime.js"
      )
    ).toHaveLength(1);
    expect(measurement.deferredRichChartGzipBytes).toBe(inventoryTotal);
  });

  it("fails closed when a reachable emitted dependency cannot be resolved", () => {
    const build = syntheticBuild();
    const baselinePath = join(build.root, "baseline.json");
    writeChunk(
      build.nextDir,
      "static/chunks/deferred-rich-chart.js",
      chunkWithDependencies(
        ["static/chunks/missing-shared-helper.js"],
        richExportSource(RICH_EXPORTS)
      )
    );

    const result = spawnSync(
      process.execPath,
      [SCRIPT, "--next-dir", build.nextDir, "--capture-baseline", baselinePath],
      { encoding: "utf8" }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(
      /deferred-rich-chart\.js.+missing-shared-helper\.js/is
    );
  });

  it("fails closed on a nonliteral emitted dynamic loader target", () => {
    const build = syntheticBuild();
    const baselinePath = join(build.root, "baseline.json");
    writeRichLoaderMetadata(
      build.nextDir,
      "static/chunks/deferred-rich-chart.js",
      "e.v(t=>e.l(resolveChunkAtRuntime()).then(()=>t(101)))"
    );

    const result = spawnSync(
      process.execPath,
      [SCRIPT, "--next-dir", build.nextDir, "--capture-baseline", baselinePath],
      { encoding: "utf8" }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/rich-loaders\.js.+unrecognized.+loader/is);
  });

  it("fails closed on an unknown loader form inside the rich reachable graph", () => {
    const build = syntheticBuild();
    const baselinePath = join(build.root, "baseline.json");
    writeChunk(
      build.nextDir,
      "static/chunks/deferred-rich-chart.js",
      Buffer.concat([
        richExportSource(RICH_EXPORTS),
        Buffer.from("\ne.l(resolveTransitiveChunk());")
      ])
    );

    const result = spawnSync(
      process.execPath,
      [SCRIPT, "--next-dir", build.nextDir, "--capture-baseline", baselinePath],
      { encoding: "utf8" }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(
      /deferred-rich-chart\.js.+unrecognized.+loader/is
    );
  });

  it("records gzip-9 inventory with path, raw bytes, gzip bytes and sha256", () => {
    const build = syntheticBuild();
    const relativePath = "static/chunks/deferred-rich-chart.js";
    const bytes = richExportSource(RICH_EXPORTS, 1024);
    writeChunk(build.nextDir, relativePath, bytes);

    const measurement = capture(build) as {
      deferredRichChartReachableChunks: Array<{
        path: string;
        kind: string;
        rawBytes: number;
        gzipBytes: number;
        sha256: string;
      }>;
    };
    const item = measurement.deferredRichChartReachableChunks.find(
      (chunk) => chunk.path === relativePath
    );

    expect(item).toEqual({
      path: relativePath,
      kind: "seed-or-transitive-dependency",
      rawBytes: bytes.length,
      gzipBytes: gzipSync(bytes, { level: 9 }).length,
      sha256: createHash("sha256").update(bytes).digest("hex")
    });
  });

  it("fails when the initial reports graph reaches any rich dependency", () => {
    const build = syntheticBuild();
    const baselinePath = join(build.root, "baseline.json");
    writeChunk(
      build.nextDir,
      build.chunks.reports,
      chunkWithDependencies(
        ["static/chunks/deferred-rich-chart.js"],
        "export const route = 'reports';"
      )
    );

    const result = spawnSync(
      process.execPath,
      [SCRIPT, "--next-dir", build.nextDir, "--capture-baseline", baselinePath],
      { encoding: "utf8" }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/reports.+initial.+rich/is);
  });

  it.each(["dashboard", "coaching"] as const)(
    "fails when the initial %s graph reaches Recharts or Motion",
    (route) => {
      const build = syntheticBuild();
      const baselinePath = join(build.root, "baseline.json");
      const dependency = `static/chunks/${route}-forbidden-runtime.js`;
      writeChunk(
        build.nextDir,
        build.chunks[route],
        chunkWithDependencies([dependency], `export const route = "${route}";`)
      );
      writeChunk(
        build.nextDir,
        dependency,
        'export const packageMarker = "node_modules/recharts";'
      );

      const result = spawnSync(
        process.execPath,
        [SCRIPT, "--next-dir", build.nextDir, "--capture-baseline", baselinePath],
        { encoding: "utf8" }
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(new RegExp(`${route}.+(Recharts|Motion)`, "is"));
    }
  );

  it("writes the measurement and failures to --report when a gate fails", () => {
    const build = syntheticBuild();
    const baselinePath = join(build.root, "baseline.json");
    const reportPath = join(build.root, "failed-report.json");
    execFileSync(
      process.execPath,
      [SCRIPT, "--next-dir", build.nextDir, "--capture-baseline", baselinePath],
      { encoding: "utf8" }
    );
    writeDeferredRichChart(build.nextDir, 80 * 1024);

    const result = spawnSync(
      process.execPath,
      [
        SCRIPT,
        "--next-dir",
        build.nextDir,
        "--baseline",
        baselinePath,
        "--report",
        reportPath
      ],
      { encoding: "utf8" }
    );
    const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
      failures: string[];
    };

    expect(result.status).toBe(1);
    expect(report.failures).not.toHaveLength(0);
  });
});
