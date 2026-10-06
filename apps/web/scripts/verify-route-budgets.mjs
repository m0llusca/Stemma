import ts from "typescript";
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
// Static charts share the app shell's existing chunks. Cap additional chart
// payload; record the full transitive footprint separately so it stays visible.
const RICH_CHART_ADDITIONAL_HARD_BYTES = 70 * 1024;
const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RICH_RENDERER_SPECIFIER =
  "@/components/charts/recharts-visuals.client";
const STATIC_RICH_SOURCES = [
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
  const buildManifest = JSON.parse(readFileSync(join(nextDir, "build-manifest.json"), "utf8"));
  if (!Array.isArray(buildManifest.rootMainFiles)) throw new Error("Build manifest has no rootMainFiles bootstrap inventory");
  for (const path of buildManifest.rootMainFiles) chunks.add(normalizeChunkPath(path));
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
    /(?:\.\s*l\s*\(|import\s*\()\s*["']((?:\/?_next\/)?static\/chunks\/[^"'?#]+\.js)["']/g;
  while ((match = directLazyPattern.exec(source))) {
    lazyDependencies.add(normalizeChunkPath(match[1]));
    recognizedLoaderSpans.push({
      start: match.index,
      end: directLazyPattern.lastIndex
    });
  }

  const lazyTablePattern =
    /\[((?:\s*["'](?:\/?_next\/)?static\/chunks\/[^"'?#]+\.js["']\s*,?)+)\]\s*\.map\s*\([^)]*?\.\s*l\s*\(/g;
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
  const loaderCallPattern = /(?:\.\s*l\s*\(|\bimport\s*\()/g;
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

function parseModuleFactories(path, source) {
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const factories = [];
  function scan(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "push" && node.expression.expression.getText(ast).includes("TURBOPACK") &&
        node.arguments[0] && ts.isArrayLiteralExpression(node.arguments[0])) {
      let ids = [];
      for (const element of node.arguments[0].elements) {
        if (ts.isNumericLiteral(element)) { ids.push(element.text); continue; }
        if (ts.isArrowFunction(element) || ts.isFunctionExpression(element)) {
          const context = element.parameters[0]?.name.getText(ast);
          const factory = { path, ids: new Set(ids), imports: new Set(), exports: new Set(), unresolvedImports: [] };
          function visit(child) {
            // A nested function's parameter can shadow the module context.
            if ((ts.isArrowFunction(child) || ts.isFunctionExpression(child) || ts.isFunctionDeclaration(child)) &&
                child.parameters.some((parameter) => parameter.name.getText(ast) === context)) return;
            if (ts.isCallExpression(child) && ts.isPropertyAccessExpression(child.expression) &&
                ts.isIdentifier(child.expression.expression) && child.expression.expression.text === context) {
              const method = child.expression.name.text;
              if (["i", "r", "A"].includes(method)) {
                if (child.arguments[0] && ts.isNumericLiteral(child.arguments[0])) factory.imports.add(child.arguments[0].text);
                else factory.unresolvedImports.push(child.getText(ast));
              }
              if (method === "s" && child.arguments[0] && ts.isArrayLiteralExpression(child.arguments[0])) {
                for (const item of child.arguments[0].elements) if (ts.isStringLiteral(item)) factory.exports.add(item.text);
                if (child.arguments[1] && ts.isNumericLiteral(child.arguments[1])) factory.ids.add(child.arguments[1].text);
              }
            }
            ts.forEachChild(child, visit);
          }
          visit(element.body);
          factories.push(factory);
        }
        ids = [];
      }
    }
    ts.forEachChild(node, scan);
  }
  scan(ast);
  return factories;
}

function richModuleClosure(chunkGraph, richSeeds, reportsChunks) {
  const loadingContext = traverseChunkGraph(chunkGraph, reportsChunks, { includeLazy: true, label: "Reports module loading context" }).reachable;
  const exportedNames = new Set(STATIC_RICH_SOURCES.map((target) => target.export));
  const queue = [...richSeeds].flatMap((path) => chunkGraph.get(path).factories.filter(
    (factory) => [...factory.exports].some((name) => exportedNames.has(name))
  ));
  if (queue.length === 0) throw new Error("Rich renderer has no emitted module export registrations");
  const seen = new Set();
  const paths = new Set(richSeeds);
  const moduleEdges = new Map();
  while (queue.length > 0) {
    const factory = queue.pop();
    if (seen.has(factory)) continue;
    seen.add(factory);
    if (factory.unresolvedImports.length > 0) {
      throw new Error(`${factory.path} has unrecognized static module imports: ${factory.unresolvedImports.join(", ")}`);
    }
    paths.add(factory.path);
    for (const id of factory.imports) {
      const dependencies = chunkGraph.modules.get(id);
      if (!dependencies) throw new Error(`${factory.path} references unregistered static module ${id}`);
      const available = [...dependencies].filter((dependency) => loadingContext.has(dependency.path));
      if (available.length === 0) throw new Error(`${factory.path} imports module ${id} outside the reports loading context`);
      for (const dependency of available) {
        if (factory.path !== dependency.path) moduleEdges.set(`${factory.path}\0${dependency.path}`, { from: factory.path, to: dependency.path });
        queue.push(dependency);
      }
    }
  }
  // Physical chunk metadata may declare further chunks needed at registration.
  const physical = traverseChunkGraph(chunkGraph, paths, { includeLazy: true, label: "Rich renderer" });
  for (const edge of physical.edges) moduleEdges.set(`${edge.from}\0${edge.to}`, edge);
  return { reachable: physical.reachable, edges: [...moduleEdges.values()] };
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

  const modules = new Map();
  for (const chunk of chunks.values()) {
    chunk.factories = parseModuleFactories(chunk.path, chunk.source);
    for (const factory of chunk.factories) {
      for (const id of factory.ids) {
        const definitions = modules.get(id) ?? new Set();
        definitions.add(factory);
        modules.set(id, definitions);
      }
    }
  }
  chunks.modules = modules;

  return chunks;
}

function richExportRegistrationPattern(exportName) {
  return new RegExp(
    `(?:["']${escapeRegExp(exportName)}["']\\s*,\\s*0\\s*,\\s*(?:function|class|\\(?[A-Za-z_$])|` +
      `export\\s+(?:const|function|class)\\s+${escapeRegExp(exportName)}\\b)`
  );
}

function emittedSeedsForExport(chunkGraph, exportName, reportsChunks) {
  const registrationPattern = richExportRegistrationPattern(exportName);
  const seeds = [...reportsChunks].filter((path) => registrationPattern.test(chunkGraph.get(path).source));
  if (seeds.length === 0) {
    throw new Error(`Missing statically imported chart export ${exportName} in the reports graph`);
  }
  return seeds.sort();
}

function validateStaticSources(chunkGraph, reportsChunks) {
  return STATIC_RICH_SOURCES.map((target) => {
    const sourcePath = resolve(APP_ROOT, target.source);
    if (!existsSync(sourcePath)) {
      throw new Error(`Missing rich chart source: ${target.source}`);
    }

    const source = readFileSync(sourcePath, "utf8");
    const staticImport = new RegExp(
      `from\\s+["']${escapeRegExp(RICH_RENDERER_SPECIFIER)}["']`
    );
    if (!staticImport.test(source)) {
      throw new Error(
        `${target.source} must statically import ${RICH_RENDERER_SPECIFIER}`
      );
    }
    if (/\bimport\s*\(/.test(source)) {
      throw new Error(
        `${target.source} must not dynamically import the rich renderer`
      );
    }
    if (!new RegExp(`\\b${escapeRegExp(target.export)}\\b`).test(source)) {
      throw new Error(
        `${target.source} does not select the expected ${target.export} export`
      );
    }

    const seedChunks = emittedSeedsForExport(chunkGraph, target.export, reportsChunks);

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

function containsMotion(chunk) {
  return /(?:node_modules[\\/_](?:framer-motion|motion)(?:[\\/_"'])|motion\/react)/i.test(
    chunk.source
  );
}

function intersection(sets) {
  const [first, ...rest] = sets;
  return new Set([...first].filter((value) => rest.every((set) => set.has(value))));
}

function measure(nextDir) {
  const chunkGraph = buildChunkGraph(nextDir);
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
  const richStaticTargets = validateStaticSources(chunkGraph, chunksByRoute.reports);
  const richSeeds = new Set(
    richStaticTargets.flatMap((target) => target.seedChunks)
  );
  const richTraversal = richModuleClosure(chunkGraph, richSeeds, chunksByRoute.reports);
  const richInventory = inventoryForChunks(
    chunkGraph,
    richTraversal.reachable
  );
  const richChartGzipBytes = gzipBytesForInventory(richInventory);
  const sharedChunks = intersection(Object.values(chunksByRoute));
  const additionalRichChunks = new Set([...richTraversal.reachable].filter((path) => !sharedChunks.has(path)));
  const richChartAdditionalGzipBytes = gzipBytesForChunks(nextDir, additionalRichChunks);
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
      .filter((path) => containsMotion(chunkGraph.get(path)))
      .sort();
  }

  return {
    sharedGzipBytes,
    richChartGzipBytes,
    richChartAdditionalGzipBytes,
    richStaticTargets,
    richChartReachableChunks: richInventory,
    richChartEdges: richTraversal.edges,
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
  if (current.richChartAdditionalGzipBytes > RICH_CHART_ADDITIONAL_HARD_BYTES) {
    failures.push(
      `additional rich-chart is ${current.richChartAdditionalGzipBytes} bytes (hard limit: 70 KiB)`
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
  for (const route of ["dashboard", "coaching"]) {
    const chunks = current.initialForbiddenLibraryChunksByRoute[route];
    if (chunks.length > 0) {
      failures.push(
        `${route} initial graph reaches Motion chunks: ${chunks.join(", ")}`
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
