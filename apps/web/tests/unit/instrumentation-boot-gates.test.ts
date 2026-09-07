import { afterEach, describe, expect, it } from "vitest";

/**
 * Boot gates live in instrumentation.ts `register()`. We re-import after
 * mutating env so each case exercises a fresh module evaluation path via
 * dynamic import of the same module (register is idempotent per process,
 * so we test the pure assertion helper exported for tests).
 */
import { assertProductionBootEnv } from "@/instrumentation";

const original = {
  NODE_ENV: process.env.NODE_ENV,
  AUTH_SECRET: process.env.AUTH_SECRET,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  QC_DEMO_AUTH: process.env.QC_DEMO_AUTH,
  QC_SECRET_KEY: process.env.QC_SECRET_KEY,
  DATABASE_URL: process.env.DATABASE_URL
};

afterEach(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("assertProductionBootEnv", () => {
  it("does nothing outside production", () => {
    process.env.NODE_ENV = "development";
    process.env.QC_DEMO_AUTH = "enabled";
    delete process.env.QC_SECRET_KEY;
    expect(() => assertProductionBootEnv()).not.toThrow();
  });

  it("refuses QC_DEMO_AUTH=enabled in production", () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_SECRET = "prod-secret";
    process.env.QC_SECRET_KEY = "prod-crypto-key";
    process.env.QC_DEMO_AUTH = "enabled";
    expect(() => assertProductionBootEnv()).toThrow(/QC_DEMO_AUTH/);
  });

  it("refuses missing QC_SECRET_KEY in production", () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_SECRET = "prod-secret";
    delete process.env.QC_DEMO_AUTH;
    delete process.env.QC_SECRET_KEY;
    expect(() => assertProductionBootEnv()).toThrow(/QC_SECRET_KEY/);
  });

  it("refuses missing AUTH_SECRET in production", () => {
    process.env.NODE_ENV = "production";
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    process.env.QC_SECRET_KEY = "prod-crypto-key";
    expect(() => assertProductionBootEnv()).toThrow(/AUTH_SECRET/);
  });

  it("passes when production secrets are set and demo auth is off", () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_SECRET = "prod-secret";
    process.env.QC_SECRET_KEY = "prod-crypto-key";
    delete process.env.QC_DEMO_AUTH;
    expect(() => assertProductionBootEnv()).not.toThrow();
  });
});
