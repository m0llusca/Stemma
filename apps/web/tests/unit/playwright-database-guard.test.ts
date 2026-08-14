import { describe, expect, it } from "vitest";
import { resolvePlaywrightTestDatabaseUrl } from "../../playwright-database-guard";

const DEDICATED_DATABASE =
  "postgresql://qc_app:qc_app@localhost:55432/qc_app_demo_verify?schema=public";

describe("resolvePlaywrightTestDatabaseUrl", () => {
  it("requires TEST_DATABASE_URL instead of falling back to DATABASE_URL", () => {
    expect(() =>
      resolvePlaywrightTestDatabaseUrl({
        DATABASE_URL: "postgresql://qc_app:qc_app@localhost:55432/qc_app?schema=public"
      })
    ).toThrow(/TEST_DATABASE_URL/);
  });

  it("rejects the developer database even when passed as TEST_DATABASE_URL", () => {
    expect(() =>
      resolvePlaywrightTestDatabaseUrl({
        TEST_DATABASE_URL: "postgresql://qc_app:qc_app@localhost:55432/qc_app?schema=public"
      })
    ).toThrow(/qc_app_demo_verify/);
  });

  it("rejects a non-public schema", () => {
    expect(() =>
      resolvePlaywrightTestDatabaseUrl({
        TEST_DATABASE_URL:
          "postgresql://qc_app:qc_app@localhost:55432/qc_app_demo_verify?schema=developer"
      })
    ).toThrow(/schema=public/);
  });

  it("rejects a remote database host", () => {
    expect(() =>
      resolvePlaywrightTestDatabaseUrl({
        TEST_DATABASE_URL:
          "postgresql://qc_app:qc_app@prod.example.com:5432/qc_app_demo_verify?schema=public"
      })
    ).toThrow(/локальн/);
  });

  it.each(["mysql:", "https:", "file:"])(
    "rejects the non-PostgreSQL %s protocol",
    (protocol) => {
      expect(() =>
        resolvePlaywrightTestDatabaseUrl({
          TEST_DATABASE_URL: `${protocol}//qc_app:qc_app@localhost:55432/qc_app_demo_verify?schema=public`
        })
      ).toThrow(/PostgreSQL/i);
    }
  );

  it("returns the explicit dedicated local database URL unchanged", () => {
    expect(
      resolvePlaywrightTestDatabaseUrl({ TEST_DATABASE_URL: DEDICATED_DATABASE })
    ).toBe(DEDICATED_DATABASE);
  });

  it("accepts an overridden dedicated database name via QC_PLAYWRIGHT_DATABASE_NAME", () => {
    const overridden =
      "postgresql://qc_app:qc_app@localhost:55432/qc_app_e2e_shard?schema=public";

    expect(
      resolvePlaywrightTestDatabaseUrl({
        TEST_DATABASE_URL: overridden,
        QC_PLAYWRIGHT_DATABASE_NAME: "qc_app_e2e_shard"
      })
    ).toBe(overridden);
  });

  it("rejects the default database name when an override is set", () => {
    expect(() =>
      resolvePlaywrightTestDatabaseUrl({
        TEST_DATABASE_URL: DEDICATED_DATABASE,
        QC_PLAYWRIGHT_DATABASE_NAME: "qc_app_e2e_shard"
      })
    ).toThrow(/qc_app_e2e_shard/);
  });

  it("ignores an empty override and keeps the default database name", () => {
    expect(
      resolvePlaywrightTestDatabaseUrl({
        TEST_DATABASE_URL: DEDICATED_DATABASE,
        QC_PLAYWRIGHT_DATABASE_NAME: ""
      })
    ).toBe(DEDICATED_DATABASE);
  });

  it("keeps the local-only host allowlist when the database name is overridden", () => {
    expect(() =>
      resolvePlaywrightTestDatabaseUrl({
        TEST_DATABASE_URL:
          "postgresql://qc_app:qc_app@prod.example.com:5432/qc_app_e2e_shard?schema=public",
        QC_PLAYWRIGHT_DATABASE_NAME: "qc_app_e2e_shard"
      })
    ).toThrow(/локальн/);
  });
});
