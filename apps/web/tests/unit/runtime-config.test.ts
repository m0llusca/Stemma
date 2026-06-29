import { describe, expect, it } from "vitest";
import { getRuntimeConfigDiagnostics } from "@/lib/runtime-config";

describe("runtime config diagnostics", () => {
  it("reports postgresql as the supported database and warns about missing secret key", () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousSecretKey = process.env.QC_SECRET_KEY;
    process.env.DATABASE_URL = "postgresql://qc_app:qc_app@localhost:55432/qc_app?schema=public";
    delete process.env.QC_SECRET_KEY;

    const diagnostics = getRuntimeConfigDiagnostics();

    expect(diagnostics.databaseProvider).toBe("postgresql");
    expect(diagnostics.checks.find((check) => check.key === "production_database")).toMatchObject({
      status: "ok"
    });
    expect(diagnostics.checks.find((check) => check.key === "secret_key")).toMatchObject({
      status: "warn"
    });

    if (previousDatabaseUrl) {
      process.env.DATABASE_URL = previousDatabaseUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
    if (previousSecretKey) {
      process.env.QC_SECRET_KEY = previousSecretKey;
    }
  });

  it("reports AI scoring readiness as fallback without YandexGPT credentials", () => {
    const previousApiKey = process.env.YANDEX_GPT_API_KEY;
    const previousCatalogId = process.env.YANDEX_GPT_CATALOG_ID;
    delete process.env.YANDEX_GPT_API_KEY;
    delete process.env.YANDEX_GPT_CATALOG_ID;

    const diagnostics = getRuntimeConfigDiagnostics();
    const check = diagnostics.checks.find((entry) => entry.key === "ai_scoring");

    expect(check).toMatchObject({ status: "warn" });
    expect(check?.message).toContain("fallback");

    restoreEnv("YANDEX_GPT_API_KEY", previousApiKey);
    restoreEnv("YANDEX_GPT_CATALOG_ID", previousCatalogId);
  });

  it("reports AI scoring readiness as yandexgpt when credentials are present", () => {
    const previousApiKey = process.env.YANDEX_GPT_API_KEY;
    const previousCatalogId = process.env.YANDEX_GPT_CATALOG_ID;
    process.env.YANDEX_GPT_API_KEY = "key";
    process.env.YANDEX_GPT_CATALOG_ID = "catalog";

    const diagnostics = getRuntimeConfigDiagnostics();
    const check = diagnostics.checks.find((entry) => entry.key === "ai_scoring");

    expect(check).toMatchObject({ status: "ok" });
    expect(check?.message).toContain("yandexgpt");

    restoreEnv("YANDEX_GPT_API_KEY", previousApiKey);
    restoreEnv("YANDEX_GPT_CATALOG_ID", previousCatalogId);
  });
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
