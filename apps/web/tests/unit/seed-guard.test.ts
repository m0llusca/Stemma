import { describe, it, expect } from "vitest";
import { assertSeedAllowed } from "../../prisma/seed-guard";

const LOCAL_DB = "postgresql://user:pass@localhost:5432/mydb";
const POSTGRES_DB = "postgresql://user:pass@postgres:5432/mydb";
const DB_HOST = "postgresql://user:pass@db:5432/mydb";
const LOOPBACK_DB = "postgresql://user:pass@127.0.0.1:5432/mydb";
const IPV6_DB = "postgresql://user:pass@[::1]:5432/mydb";
const REMOTE_DB = "postgresql://user:pass@prod.example.com:5432/mydb";

describe("assertSeedAllowed", () => {
  it("allows localhost", () => {
    expect(() => assertSeedAllowed({ DATABASE_URL: LOCAL_DB })).not.toThrow();
  });

  it("allows 127.0.0.1", () => {
    expect(() => assertSeedAllowed({ DATABASE_URL: LOOPBACK_DB })).not.toThrow();
  });

  it("allows ::1 (IPv6 loopback)", () => {
    expect(() => assertSeedAllowed({ DATABASE_URL: IPV6_DB })).not.toThrow();
  });

  it("allows hostname 'postgres'", () => {
    expect(() => assertSeedAllowed({ DATABASE_URL: POSTGRES_DB })).not.toThrow();
  });

  it("allows hostname 'db'", () => {
    expect(() => assertSeedAllowed({ DATABASE_URL: DB_HOST })).not.toThrow();
  });

  it("blocks when NODE_ENV=production", () => {
    expect(() =>
      assertSeedAllowed({ NODE_ENV: "production", DATABASE_URL: LOCAL_DB })
    ).toThrow(/NODE_ENV=production/);
  });

  it("blocks non-local host", () => {
    expect(() =>
      assertSeedAllowed({ DATABASE_URL: REMOTE_DB })
    ).toThrow(/prod\.example\.com/);
  });

  it("ALLOW_SEED=1 overrides production block", () => {
    expect(() =>
      assertSeedAllowed({ NODE_ENV: "production", DATABASE_URL: LOCAL_DB, ALLOW_SEED: "1" })
    ).not.toThrow();
  });

  it("ALLOW_SEED=1 overrides non-local host block", () => {
    expect(() =>
      assertSeedAllowed({ DATABASE_URL: REMOTE_DB, ALLOW_SEED: "1" })
    ).not.toThrow();
  });

  it("blocks when DATABASE_URL is missing", () => {
    expect(() => assertSeedAllowed({})).toThrow(/DATABASE_URL не задан/);
  });

  it("ALLOW_SEED=1 overrides missing DATABASE_URL block", () => {
    expect(() => assertSeedAllowed({ ALLOW_SEED: "1" })).not.toThrow();
  });

  it("blocks when DATABASE_URL is not a valid URL", () => {
    expect(() => assertSeedAllowed({ DATABASE_URL: "not-a-url" })).toThrow(
      /корректным URL/
    );
  });

  it("error message mentions ALLOW_SEED=1 for production block", () => {
    expect(() =>
      assertSeedAllowed({ NODE_ENV: "production", DATABASE_URL: LOCAL_DB })
    ).toThrow(/ALLOW_SEED=1/);
  });

  it("error message mentions ALLOW_SEED=1 for non-local host block", () => {
    expect(() =>
      assertSeedAllowed({ DATABASE_URL: REMOTE_DB })
    ).toThrow(/ALLOW_SEED=1/);
  });
});
