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
});
