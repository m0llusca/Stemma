import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync
} from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const ROUTES = ["reports", "dashboard", "coaching"];
const HARD_DELTA_BYTES = {
  shared: 0,
  reports: 45 * 1024,
  dashboard: 10 * 1024,
  coaching: 10 * 1024
};
const DEFERRED_RICH_CHART_HARD_BYTES = 70 * 1024;
const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RICH_RENDERER_SPECIFIER =
  "@/components/charts/recharts-visuals.client";
const RICH_DYNAMIC_SOURCES = [
  {
    source: "src/components/charts/quality-trend-chart.client.tsx",
    export: "QualityTrendVisual"
  },
  {
    source: "src/components/charts/ranked-driver-chart.client.tsx",
    export: "RankedDriverVisual"
  },
  {
    source: "src/components/charts/score-distribution-chart.client.tsx",
    export: "ScoreDistributionVisual"
  },
  {
    source: "src/components/charts/paired-ai-drift-charts.client.tsx",
    export: "PairedAiDriftVisual"
  },
  {
    source: "src/components/charts/reason-trend-chart.client.tsx",
    export: "ReasonTrendVisual"
  },
  {
    source: "src/components/charts/ranked-breakdown-chart.client.tsx",
    export: "RankedBreakdownVisual"
  }
];

function parseArguments(argv) {
  const result = {
    nextDir: resolve(".next"),
    captureBaseline: null,
    baseline: null,
    report: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];

    if (argument === "--next-dir" && value) {
      result.nextDir = resolve(value);
      index += 1;
    } else if (argument === "--capture-baseline" && value) {
      result.captureBaseline = resolve(value);
      index += 1;
    } else if (argument === "--baseline" && value) {
      result.baseline = resolve(value);
      index += 1;
    } else if (argument === "--report" && value) {
      result.report = resolve(value);
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
  }

  if (Boolean(result.captureBaseline) === Boolean(result.baseline)) {
    throw new Error("Use exactly one of --capture-baseline or --baseline.");
  }

  return result;
}

function normalizeChunkPath(value) {
  return value.replace(/^\/?_next\//, "").replace(/^\/+/, "");
}

function readRouteChunks(nextDir, route) {
  const manifestPath = join(
    nextDir,
    "server",
    "app",
    route,
    "page_client-reference-manifest.js"
  );
  if (!existsSync(manifestPath)) {
    throw new Error(`Missing client-reference manifest for /${route}: ${manifestPath}`);
  }

  const sandbox = {};
  runInNewContext(readFileSync(manifestPath, "utf8"), sandbox, {
    filename: manifestPath
  });
  const routeManifest = Object.values(sandbox.__RSC_MANIFEST ?? {})[0];
  if (!routeManifest) {
    throw new Error(`Client-reference manifest has no route payload: ${manifestPath}`);
  }

  const chunks = new Set();
  for (const moduleEntry of Object.values(routeManifest.clientModules ?? {})) {
    for (const chunk of moduleEntry.chunks ?? []) {
      chunks.add(normalizeChunkPath(chunk));
    }
  }
  for (const entryChunks of Object.values(routeManifest.entryJSFiles ?? {})) {
    for (const chunk of entryChunks ?? []) {
      chunks.add(normalizeChunkPath(chunk));
    }
  }

  return chunks;
}

function gzipBytesForChunks(nextDir, chunks) {
  let total = 0;

  for (const chunk of chunks) {
    const chunkPath = join(nextDir, chunk);
    if (!existsSync(chunkPath)) {
      throw new Error(`Manifest references a missing client chunk: ${chunkPath}`);
    }
    total += gzipSync(readFileSync(chunkPath), { level: 9 }).length;
  }

  return total;
}

function listJavaScriptFiles(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return listJavaScriptFiles(entryPath);
    }
    return entry.isFile() && entry.name.endsWith(".js") ? [entryPath] : [];
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function quotedJavaScriptPaths(value) {
  const paths = [];
  const pattern = /["']((?:\/?_next\/)?static\/chunks\/[^"'?#]+\.js)["']/g;
  let match;

  while ((match = pattern.exec(value))) {
    paths.push(normalizeChunkPath(match[1]));
  }

  return paths;
}

function indexIsWithinSpans(index, spans) {
  return spans.some(({ start, end }) => index >= start && index < end);
}

function parseChunkDependencies(source) {
  const staticDependencies = new Set();
  const lazyDependencies = new Set();
  const recognizedLoaderSpans = [];
  const otherChunksPattern = /otherChunks\s*:\s*\[([\s\S]*?)\]/g;
  let match;

  while ((match = otherChunksPattern.exec(source))) {
    for (const dependency of quotedJavaScriptPaths(match[1])) {
      staticDependencies.add(dependency);
    }
  }

  const directLazyPattern =
    /(?:\.\s*[lL]\s*\(|import\s*\()\s*["']((?:\/?_next\/)?static\/chunks\/[^"'?#]+\.js)["']/g;
  while ((match = directLazyPattern.exec(source))) {
    lazyDependencies.add(normalizeChunkPath(match[1]));
    recognizedLoaderSpans.push({
      start: match.index,
      end: directLazyPattern.lastIndex
    });
  }

  const lazyTablePattern =
    /\[((?:\s*["'](?:\/?_next\/)?static\/chunks\/[^"'?#]+\.js["']\s*,?)+)\]\s*\.map\s*\([^)]*?\.\s*[lL]\s*\(/g;
  while ((match = lazyTablePattern.exec(source))) {
    for (const dependency of quotedJavaScriptPaths(match[1])) {
      lazyDependencies.add(dependency);
    }
    recognizedLoaderSpans.push({
      start: match.index,
      end: lazyTablePattern.lastIndex
    });
  }

  for (const dependency of staticDependencies) {
    lazyDependencies.delete(dependency);
  }

  const unresolvedLoaderCalls = [];
  const loaderCallPattern = /(?:\.\s*[lL]\s*\(|\bimport\s*\()/g;
  while ((match = loaderCallPattern.exec(source))) {
    if (!indexIsWithinSpans(match.index, recognizedLoaderSpans)) {
      unresolvedLoaderCalls.push(
        source
          .slice(match.index, Math.min(source.length, match.index + 120))
          .replace(/\s+/g, " ")
      );
    }
  }

  return {
    staticDependencies,
    lazyDependencies,
    unresolvedLoaderCalls
  };
}

function buildChunkGraph(nextDir) {
  const chunks = new Map();

  for (const absolutePath of listJavaScriptFiles(
    join(nextDir, "static", "chunks")
  )) {
    const relativePath = normalizeChunkPath(
      absolutePath.slice(nextDir.length + 1)
    );
    const bytes = readFileSync(absolutePath);
    const source = bytes.toString("utf8");
    chunks.set(relativePath, {
      path: relativePath,
      bytes,
      source,
      ...parseChunkDependencies(source)
    });
  }

  return chunks;
}

function extractBalancedBlock(source, openingBraceIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = openingBraceIndex; index < source.length; index += 1) {
    const character = source[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === '"' || character === "'" || character === "`") {
      quote = character;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openingBraceIndex + 1, index);
      }
    }
  }

  return null;
}

function moduleBodiesForId(source, moduleId) {
  const bodies = [];
  const modulePattern = new RegExp(
    `(?:^|[,\\[])\\s*${escapeRegExp(moduleId)}\\s*,\\s*[A-Za-z_$][\\w$]*\\s*=>\\s*\\{`,
    "g"
  );
  let match;

  while ((match = modulePattern.exec(source))) {
    const openingBraceIndex = modulePattern.lastIndex - 1;
    const body = extractBalancedBlock(source, openingBraceIndex);
    if (body === null) {
      throw new Error(
        `Unrecognized emitted loader module ${moduleId}: unbalanced module body`
      );
    }
    bodies.push(body);
    modulePattern.lastIndex = openingBraceIndex + body.length + 2;
  }

  return bodies;
}

function richExportRegistrationPattern(exportName) {
  return new RegExp(
    `(?:["']${escapeRegExp(exportName)}["']\\s*,\\s*0\\s*,\\s*(?:function|class|\\(?[A-Za-z_$])|` +
      `export\\s+(?:const|function|class)\\s+${escapeRegExp(exportName)}\\b)`
  );
}

function emittedSeedsForExport(chunkGraph, exportName) {
  const usagePattern = new RegExp(
    `\\.\\s*A\\s*\\(\\s*(\\d+)\\s*\\)\\s*\\)\\s*\\.\\s*${escapeRegExp(exportName)}\\b`,
    "g"
  );
  const usages = [];

  for (const chunk of chunkGraph.values()) {
    let match;
    while ((match = usagePattern.exec(chunk.source))) {
      usages.push({ chunk, moduleId: match[1] });
    }
  }

  if (usages.length === 0) {
    throw new Error(
      `No emitted dynamic-loader usage resolves rich export ${exportName}`
    );
  }

  const seedChunks = new Set();
  const resolvedLoaderModules = new Set();
  for (const usage of usages) {
    const candidateChunks = [
      usage.chunk,
      ...[...chunkGraph.values()].filter(
        (chunk) => chunk.path !== usage.chunk.path
      )
    ];

    for (const candidate of candidateChunks) {
      const bodies = moduleBodiesForId(candidate.source, usage.moduleId);
      for (const body of bodies) {
        const loaderKey = `${candidate.path}\0${usage.moduleId}\0${body}`;
        if (resolvedLoaderModules.has(loaderKey)) {
          continue;
        }
        resolvedLoaderModules.add(loaderKey);
        const dependencies = parseChunkDependencies(body);
        if (dependencies.unresolvedLoaderCalls.length > 0) {
          throw new Error(
            `${candidate.path} has an unrecognized emitted loader for ${exportName}: ` +
              dependencies.unresolvedLoaderCalls.join(", ")
          );
        }
        for (const dependency of dependencies.lazyDependencies) {
          seedChunks.add(dependency);
        }
      }
    }
  }

  if (resolvedLoaderModules.size === 0 || seedChunks.size === 0) {
    throw new Error(
      `No emitted loader table resolves rich export ${exportName}`
    );
  }

  for (const seedChunk of seedChunks) {
    if (!chunkGraph.has(seedChunk)) {
      throw new Error(
        `Emitted loader for ${exportName} references a missing client chunk: ${seedChunk}`
      );
    }
  }

  const registrationPattern = richExportRegistrationPattern(exportName);
  if (
    ![...seedChunks].some((seedChunk) =>
      registrationPattern.test(chunkGraph.get(seedChunk).source)
    )
  ) {
    throw new Error(
      `Resolved rich seed chunks do not register expected export ${exportName}`
    );
  }

  return [...seedChunks].sort();
}

function validateDynamicSources(chunkGraph) {
  return RICH_DYNAMIC_SOURCES.map((target) => {
    const sourcePath = resolve(APP_ROOT, target.source);
    if (!existsSync(sourcePath)) {
      throw new Error(`Missing rich chart source: ${target.source}`);
    }

    const source = readFileSync(sourcePath, "utf8");
    const importCalls = source.match(/\bimport\s*\(/g) ?? [];
    const literalImports = [
      ...source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)
    ].map((match) => match[1]);
    if (
      importCalls.length !== 1 ||
      literalImports.length !== 1 ||
      literalImports[0] !== RICH_RENDERER_SPECIFIER
    ) {
      throw new Error(
        `${target.source} must contain exactly one literal dynamic import of ${RICH_RENDERER_SPECIFIER}`
      );
    }
    if (!new RegExp(`\\.\\s*${escapeRegExp(target.export)}\\b`).test(source)) {
      throw new Error(
        `${target.source} does not select the expected ${target.export} export`
      );
    }

    const seedChunks = emittedSeedsForExport(chunkGraph, target.export);

    return {
      source: target.source,
      specifier: RICH_RENDERER_SPECIFIER,
      export: target.export,
      seedChunks
    };
  });
}

function traverseChunkGraph(chunkGraph, seeds, { includeLazy, label }) {
  const reachable = new Set();
  const edges = new Map();
  const queue = [...seeds];

  while (queue.length > 0) {
    const path = queue.shift();
    if (reachable.has(path)) {
      continue;
    }
    const chunk = chunkGraph.get(path);
    if (!chunk) {
      throw new Error(`${label} references a missing client chunk: ${path}`);
    }
    if (chunk.unresolvedLoaderCalls.length > 0) {
      throw new Error(
        `${path} has an unrecognized emitted loader: ` +
          chunk.unresolvedLoaderCalls.join(", ")
      );
    }
    reachable.add(path);

    const dependencies = includeLazy
      ? new Set([
          ...chunk.staticDependencies,
          ...chunk.lazyDependencies
        ])
      : chunk.staticDependencies;
    for (const dependency of dependencies) {
      if (!chunkGraph.has(dependency)) {
        throw new Error(
          `Unresolved emitted dependency from ${path} to ${dependency}`
        );
      }
      edges.set(`${path}\0${dependency}`, { from: path, to: dependency });
      if (!reachable.has(dependency)) {
        queue.push(dependency);
      }
    }
  }

  return {
    reachable,
    edges: [...edges.values()].sort(
      (left, right) =>
        left.from.localeCompare(right.from) ||
        left.to.localeCompare(right.to)
    )
  };
}

function inventoryForChunks(chunkGraph, paths) {
  return [...paths]
    .sort()
    .map((path) => {
      const bytes = chunkGraph.get(path).bytes;
      return {
        path,
        kind: "seed-or-transitive-dependency",
        rawBytes: bytes.length,
        gzipBytes: gzipSync(bytes, { level: 9 }).length,
        sha256: createHash("sha256").update(bytes).digest("hex")
      };
    });
}

function gzipBytesForInventory(inventory) {
  return inventory.reduce((sum, chunk) => sum + chunk.gzipBytes, 0);
}

function containsRechartsOrMotion(chunk) {
  return /(?:node_modules[\\/_](?:recharts|framer-motion|motion)(?:[\\/_"'])|recharts-surface|data-animation-active|motion\/react)/i.test(
    chunk.source
  );
}

function intersection(sets) {
  const [first, ...rest] = sets;
  return new Set([...first].filter((value) => rest.every((set) => set.has(value))));
}

function measure(nextDir) {
  const chunkGraph = buildChunkGraph(nextDir);
  const richDynamicTargets = validateDynamicSources(chunkGraph);
  const richSeeds = new Set(
    richDynamicTargets.flatMap((target) => target.seedChunks)
  );
  const richTraversal = traverseChunkGraph(chunkGraph, richSeeds, {
    includeLazy: true,
    label: "Rich renderer"
  });
  const richInventory = inventoryForChunks(
    chunkGraph,
    richTraversal.reachable
  );
  const deferredRichChartGzipBytes = gzipBytesForInventory(richInventory);
  const chunksByRoute = Object.fromEntries(
    ROUTES.map((route) => {
      const seeds = readRouteChunks(nextDir, route);
      const traversal = traverseChunkGraph(chunkGraph, seeds, {
        includeLazy: false,
        label: `/${route} initial graph`
      });
      return [route, traversal.reachable];
    })
  );
  const sharedChunks = intersection(Object.values(chunksByRoute));
  const sharedGzipBytes = gzipBytesForChunks(nextDir, sharedChunks);
  const routes = {};
  const initialRichChartGzipBytesByRoute = {};
  const initialForbiddenLibraryChunksByRoute = {};

  for (const route of ROUTES) {
    const routeChunks = chunksByRoute[route];
    const routeSpecificChunks = new Set(
      [...routeChunks].filter((chunk) => !sharedChunks.has(chunk))
    );
    routes[route] = {
      unionGzipBytes: gzipBytesForChunks(nextDir, routeChunks),
      routeSpecificGzipBytes: gzipBytesForChunks(nextDir, routeSpecificChunks)
    };
    const initialRichChunks = new Set(
      [...routeChunks].filter((chunk) =>
        richTraversal.reachable.has(chunk)
      )
    );
    initialRichChartGzipBytesByRoute[route] = gzipBytesForChunks(
      nextDir,
      initialRichChunks
    );
    initialForbiddenLibraryChunksByRoute[route] = [...routeChunks]
      .filter((path) => containsRechartsOrMotion(chunkGraph.get(path)))
      .sort();
  }

  return {
    sharedGzipBytes,
    deferredRichChartGzipBytes,
    richDynamicTargets,
    deferredRichChartReachableChunks: richInventory,
    deferredRichChartEdges: richTraversal.edges,
    initialRichChartGzipBytesByRoute,
    initialForbiddenLibraryChunksByRoute,
    routes
  };
}

function compare(current, baseline) {
  const failures = structuralFailures(current);
  const sharedDelta = current.sharedGzipBytes - baseline.sharedGzipBytes;
  if (sharedDelta > HARD_DELTA_BYTES.shared) {
    failures.push(`shared grew by ${sharedDelta} bytes (hard limit: 0 KiB)`);
  }
  if (current.deferredRichChartGzipBytes > DEFERRED_RICH_CHART_HARD_BYTES) {
    failures.push(
      `deferred rich-chart is ${current.deferredRichChartGzipBytes} bytes (hard limit: 70 KiB)`
    );
  }

  for (const route of ROUTES) {
    const delta =
      current.routes[route].unionGzipBytes -
      baseline.routes[route].unionGzipBytes;
    if (delta > HARD_DELTA_BYTES[route]) {
      failures.push(
        `${route} grew by ${delta} bytes (hard limit: ${HARD_DELTA_BYTES[route] / 1024} KiB)`
      );
    }
  }

  return failures;
}

function structuralFailures(current) {
  const failures = [];
  if (current.initialRichChartGzipBytesByRoute.reports > 0) {
    failures.push(
      `reports initial graph reaches ${current.initialRichChartGzipBytesByRoute.reports} bytes of rich-chart dependencies`
    );
  }
  for (const route of ["dashboard", "coaching"]) {
    const chunks = current.initialForbiddenLibraryChunksByRoute[route];
    if (chunks.length > 0) {
      failures.push(
        `${route} initial graph reaches Recharts or Motion chunks: ${chunks.join(", ")}`
      );
    }
  }
  return failures;
}

function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporaryPath, path);
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const current = measure(options.nextDir);

  if (options.captureBaseline) {
    const failures = structuralFailures(current);
    writeJsonAtomic(options.captureBaseline, current);
    if (options.report) {
      writeJsonAtomic(options.report, { ...current, failures });
    }
    if (failures.length > 0) {
      process.stderr.write(
        `Route budget check failed:\n- ${failures.join("\n- ")}\n`
      );
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`Captured route budget baseline: ${options.captureBaseline}\n`);
    return;
  }

  const baseline = JSON.parse(readFileSync(options.baseline, "utf8"));
  const failures = compare(current, baseline);
  if (options.report) {
    writeJsonAtomic(options.report, { ...current, failures });
  }
  if (failures.length > 0) {
    process.stderr.write(`Route budget check failed:\n- ${failures.join("\n- ")}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write("Route budget check passed.\n");
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
