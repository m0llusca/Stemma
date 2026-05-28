import { describe, expect, it } from "vitest";
import { createYdbAdapter } from "@/lib/integrations/data-source-adapters/ydb";
import { createYTsaurusAdapter } from "@/lib/integrations/data-source-adapters/ytsaurus";
import { dataSourceSources } from "@/lib/integrations/data-source-adapters/source-contracts";
import type {
  DataSourceAdapterLoadResult,
  DataSourceSource
} from "@/lib/integrations/data-source-adapters/types";

const liveSmokeAck = process.env.DATA_SOURCE_LIVE_SMOKE === "1";
const connectivityOnly = process.env.DATA_SOURCE_LIVE_CONNECTIVITY_ONLY === "1";
const liveSource = normalizeSource(process.env.DATA_SOURCE_LIVE_SOURCE);
const unsupportedSourceConfigured = Boolean(process.env.DATA_SOURCE_LIVE_SOURCE && !liveSource);
const missingLiveConfig = liveSmokeAck && !unsupportedSourceConfigured && missingRequiredEnvironment(liveSource).length > 0;

function normalizeSource(value: string | undefined): DataSourceSource | null {
  const normalized = value?.trim().toLowerCase();
  return normalized === "ydb" || normalized === "ytsaurus" ? normalized : null;
}

function stringEnv(name: string) {
  return process.env[name]?.trim() || "";
}

function positiveIntegerEnv(name: string, defaultValue: number) {
  const raw = stringEnv(name);
  if (!raw) return defaultValue;

  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue;
}

function missingRequiredEnvironment(source: DataSourceSource | null) {
  const required = ["DATA_SOURCE_LIVE_SOURCE", "DATA_SOURCE_LIVE_BASE_URL", "DATA_SOURCE_LIVE_CREDENTIAL"];

  if (source === "ydb") {
    required.push("DATA_SOURCE_LIVE_YDB_QUERY");
  }

  if (source === "ytsaurus") {
    required.push("DATA_SOURCE_LIVE_YTSAURUS_TABLE_PATH");
  }

  return required.filter((name) => !stringEnv(name));
}

function sourceConfig(source: DataSourceSource) {
  if (source === "ydb") {
    return { query: stringEnv("DATA_SOURCE_LIVE_YDB_QUERY") };
  }

  return { tablePath: stringEnv("DATA_SOURCE_LIVE_YTSAURUS_TABLE_PATH") };
}

function createAdapter(source: DataSourceSource) {
  return source === "ydb" ? createYdbAdapter() : createYTsaurusAdapter();
}

function hasSafeDiagnostics(result: DataSourceAdapterLoadResult, credential: string) {
  const diagnosticText = JSON.stringify(result.diagnostics);

  return (
    result.diagnostics.requests.length > 0 &&
    !diagnosticText.includes(credential) &&
    result.diagnostics.requests.every((request) => request.statusCode >= 100 && request.statusCode < 600)
  );
}

describe.skipIf(!liveSmokeAck)("live data source adapter smoke", () => {
  it("loads one protected data source through the selected adapter", async () => {
    if (unsupportedSourceConfigured) {
      throw new Error(`Unsupported DATA_SOURCE_LIVE_SOURCE "${process.env.DATA_SOURCE_LIVE_SOURCE}". Expected one of: ${dataSourceSources.join(", ")}.`);
    }

    if (missingLiveConfig || !liveSource) {
      throw new Error(`Live data source smoke test requires: ${missingRequiredEnvironment(liveSource).join(", ")}.`);
    }

    const credential = stringEnv("DATA_SOURCE_LIVE_CREDENTIAL");
    const result = await createAdapter(liveSource).loadRows({
      source: liveSource,
      baseUrl: stringEnv("DATA_SOURCE_LIVE_BASE_URL"),
      config: sourceConfig(liveSource),
      credential,
      limit: positiveIntegerEnv("DATA_SOURCE_LIVE_LIMIT", 1),
      timeoutMs: positiveIntegerEnv("DATA_SOURCE_LIVE_TIMEOUT_MS", 15_000),
      maxResponseBytes: positiveIntegerEnv("DATA_SOURCE_LIVE_MAX_RESPONSE_BYTES", 2_000_000)
    });

    expect(result.source).toBe(liveSource);
    expect(result.rows).toEqual(expect.any(Array));
    expect(result.conversations).toEqual(expect.any(Array));

    if (connectivityOnly) {
      expect(result.conversations.length > 0 || hasSafeDiagnostics(result, credential)).toBe(true);
      return;
    }

    expect(result.conversations.length).toBeGreaterThan(0);
  });
});
