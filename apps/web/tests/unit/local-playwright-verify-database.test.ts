import { describe, expect, it } from "vitest";
import { isLocalPlaywrightVerifyDatabase } from "@/lib/local-playwright-verify-database";

const LOCAL_VERIFY_DATABASE_URL =
  "postgresql://qc_app:qc_app@localhost:55432/qc_app_demo_verify?schema=public";
const LOCAL_DEVELOPER_DATABASE_URL =
  "postgresql://qc_app:qc_app@localhost:55432/qc_app?schema=public";
const REMOTE_VERIFY_NAMED_URL =
  "postgresql://qc_app:qc_app@prod.example.com:5432/qc_app_demo_verify?schema=public";
const LOOPBACK_VERIFY_DATABASE_URL =
  "postgresql://qc_app:qc_app@127.0.0.1:55432/qc_app_demo_verify?schema=public";

describe("isLocalPlaywrightVerifyDatabase", () => {
  it("returns true only when both URLs point at the local verify database", () => {
    expect(
      isLocalPlaywrightVerifyDatabase({
        TEST_DATABASE_URL: LOCAL_VERIFY_DATABASE_URL,
        DATABASE_URL: LOCAL_VERIFY_DATABASE_URL
      })
    ).toBe(true);
  });

  it("accepts equivalent local verify hosts on the allowlist for both URLs", () => {
    expect(
      isLocalPlaywrightVerifyDatabase({
        TEST_DATABASE_URL: LOCAL_VERIFY_DATABASE_URL,
        DATABASE_URL: LOOPBACK_VERIFY_DATABASE_URL
      })
    ).toBe(true);
  });

  it("fails closed when TEST_DATABASE_URL is verify but DATABASE_URL is the developer database", () => {
    expect(
      isLocalPlaywrightVerifyDatabase({
        TEST_DATABASE_URL: LOCAL_VERIFY_DATABASE_URL,
        DATABASE_URL: LOCAL_DEVELOPER_DATABASE_URL
      })
    ).toBe(false);
  });

  it("fails closed when TEST_DATABASE_URL is verify but DATABASE_URL is remote", () => {
    expect(
      isLocalPlaywrightVerifyDatabase({
        TEST_DATABASE_URL: LOCAL_VERIFY_DATABASE_URL,
        DATABASE_URL: REMOTE_VERIFY_NAMED_URL
      })
    ).toBe(false);
  });

  it("fails closed when DATABASE_URL is missing", () => {
    expect(
      isLocalPlaywrightVerifyDatabase({
        TEST_DATABASE_URL: LOCAL_VERIFY_DATABASE_URL
      })
    ).toBe(false);
  });

  it("fails closed when TEST_DATABASE_URL is missing", () => {
    expect(
      isLocalPlaywrightVerifyDatabase({
        DATABASE_URL: LOCAL_VERIFY_DATABASE_URL
      })
    ).toBe(false);
  });

  it("accepts an explicit local shard name only when both URLs use that name", () => {
    const shardUrl =
      "postgresql://qc_app:qc_app@localhost:55432/qc_app_e2e_shard?schema=public";

    expect(
      isLocalPlaywrightVerifyDatabase({
        TEST_DATABASE_URL: shardUrl,
        DATABASE_URL: shardUrl,
        QC_PLAYWRIGHT_DATABASE_NAME: "qc_app_e2e_shard"
      })
    ).toBe(true);

    expect(
      isLocalPlaywrightVerifyDatabase({
        TEST_DATABASE_URL: shardUrl,
        DATABASE_URL: LOCAL_VERIFY_DATABASE_URL,
        QC_PLAYWRIGHT_DATABASE_NAME: "qc_app_e2e_shard"
      })
    ).toBe(false);

    expect(
      isLocalPlaywrightVerifyDatabase({
        TEST_DATABASE_URL: shardUrl,
        DATABASE_URL: shardUrl
      })
    ).toBe(false);
  });
});
