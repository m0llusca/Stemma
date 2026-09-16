import { afterEach, describe, expect, it, vi } from "vitest";
import { assertProductionBootEnv } from "@/instrumentation";

const LOCAL_VERIFY_DATABASE_URL =
  "postgresql://qc_app:qc_app@localhost:55432/qc_app_demo_verify?schema=public";
const LOOPBACK_VERIFY_DATABASE_URL =
  "postgresql://qc_app:qc_app@127.0.0.1:55432/qc_app_demo_verify?schema=public";
const OTHER_PORT_VERIFY_DATABASE_URL =
  "postgresql://qc_app:qc_app@127.0.0.1:5432/qc_app_demo_verify?schema=public";
const LOCAL_DEVELOPER_DATABASE_URL =
  "postgresql://qc_app:qc_app@localhost:55432/qc_app?schema=public";
const REMOTE_DATABASE_URL =
  "postgresql://qc_app:qc_app@prod.example.com:5432/qc_app_demo_verify?schema=public";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("assertProductionBootEnv", () => {
  it("does nothing outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("QC_DEMO_AUTH", "enabled");
    vi.stubEnv("QC_SECRET_KEY", "");
    expect(() => assertProductionBootEnv()).not.toThrow();
  });

  it("refuses QC_DEMO_AUTH=enabled in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "prod-secret");
    vi.stubEnv("QC_SECRET_KEY", "prod-crypto-key");
    vi.stubEnv("QC_DEMO_AUTH", "enabled");
    delete process.env.TEST_DATABASE_URL;
    expect(() => assertProductionBootEnv()).toThrow(/QC_DEMO_AUTH/);
  });

  it("allows QC_DEMO_AUTH=enabled in production only for the local Playwright verify database", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "prod-secret");
    vi.stubEnv("QC_SECRET_KEY", "prod-crypto-key");
    vi.stubEnv("QC_DEMO_AUTH", "enabled");
    vi.stubEnv("TEST_DATABASE_URL", LOCAL_VERIFY_DATABASE_URL);
    vi.stubEnv("DATABASE_URL", LOCAL_VERIFY_DATABASE_URL);
    expect(() => assertProductionBootEnv()).not.toThrow();
  });

  it("allows demo auth when TEST and DATABASE use equivalent loopback hosts on the same port", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "prod-secret");
    vi.stubEnv("QC_SECRET_KEY", "prod-crypto-key");
    vi.stubEnv("QC_DEMO_AUTH", "enabled");
    vi.stubEnv("TEST_DATABASE_URL", LOCAL_VERIFY_DATABASE_URL);
    vi.stubEnv("DATABASE_URL", LOOPBACK_VERIFY_DATABASE_URL);
    expect(() => assertProductionBootEnv()).not.toThrow();
  });

  it("refuses demo auth when TEST and DATABASE are both local verify-named but on different ports", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "prod-secret");
    vi.stubEnv("QC_SECRET_KEY", "prod-crypto-key");
    vi.stubEnv("QC_DEMO_AUTH", "enabled");
    vi.stubEnv("TEST_DATABASE_URL", LOCAL_VERIFY_DATABASE_URL);
    vi.stubEnv("DATABASE_URL", OTHER_PORT_VERIFY_DATABASE_URL);
    expect(() => assertProductionBootEnv()).toThrow(/QC_DEMO_AUTH/);
  });

  it("still refuses demo auth when TEST_DATABASE_URL is not the local verify database", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "prod-secret");
    vi.stubEnv("QC_SECRET_KEY", "prod-crypto-key");
    vi.stubEnv("QC_DEMO_AUTH", "enabled");
    vi.stubEnv("TEST_DATABASE_URL", LOCAL_DEVELOPER_DATABASE_URL);
    vi.stubEnv("DATABASE_URL", LOCAL_DEVELOPER_DATABASE_URL);
    expect(() => assertProductionBootEnv()).toThrow(/QC_DEMO_AUTH/);
  });

  it("refuses demo auth when TEST_DATABASE_URL is verify but DATABASE_URL is not", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "prod-secret");
    vi.stubEnv("QC_SECRET_KEY", "prod-crypto-key");
    vi.stubEnv("QC_DEMO_AUTH", "enabled");
    vi.stubEnv("TEST_DATABASE_URL", LOCAL_VERIFY_DATABASE_URL);
    vi.stubEnv("DATABASE_URL", LOCAL_DEVELOPER_DATABASE_URL);
    expect(() => assertProductionBootEnv()).toThrow(/QC_DEMO_AUTH/);
  });

  it("refuses demo auth when TEST_DATABASE_URL is verify but DATABASE_URL is remote", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "prod-secret");
    vi.stubEnv("QC_SECRET_KEY", "prod-crypto-key");
    vi.stubEnv("QC_DEMO_AUTH", "enabled");
    vi.stubEnv("TEST_DATABASE_URL", LOCAL_VERIFY_DATABASE_URL);
    vi.stubEnv("DATABASE_URL", REMOTE_DATABASE_URL);
    expect(() => assertProductionBootEnv()).toThrow(/QC_DEMO_AUTH/);
  });

  it("refuses missing QC_SECRET_KEY in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "prod-secret");
    vi.stubEnv("QC_DEMO_AUTH", "");
    // Ensure key is unset — stub empty then delete for has-check semantics
    vi.stubEnv("QC_SECRET_KEY", "");
    delete process.env.QC_SECRET_KEY;
    expect(() => assertProductionBootEnv()).toThrow(/QC_SECRET_KEY/);
  });

  it("refuses missing AUTH_SECRET in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("NEXTAUTH_SECRET", "");
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    vi.stubEnv("QC_SECRET_KEY", "prod-crypto-key");
    expect(() => assertProductionBootEnv()).toThrow(/AUTH_SECRET/);
  });

  it("passes when production secrets are set and demo auth is off", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "prod-secret");
    vi.stubEnv("QC_SECRET_KEY", "prod-crypto-key");
    vi.stubEnv("QC_DEMO_AUTH", "");
    delete process.env.QC_DEMO_AUTH;
    expect(() => assertProductionBootEnv()).not.toThrow();
  });
});
