import { describe, it, expect, vi } from "vitest";
import { runPreparedDemoSeed } from "../../prisma/demo-seed-bootstrap";
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

  it("does not allow ALLOW_SEED=1 to override the production block", () => {
    expect(() =>
      assertSeedAllowed({ NODE_ENV: "production", DATABASE_URL: LOCAL_DB, ALLOW_SEED: "1" })
    ).toThrow(/NODE_ENV=production/);
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

  it("does not advertise an override for the production block", () => {
    try {
      assertSeedAllowed({ NODE_ENV: "production", DATABASE_URL: LOCAL_DB });
      throw new Error("Expected production seed guard to throw.");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toMatch(/ALLOW_SEED/);
    }
  });

  it("error message mentions ALLOW_SEED=1 for non-local host block", () => {
    expect(() =>
      assertSeedAllowed({ DATABASE_URL: REMOTE_DB })
    ).toThrow(/ALLOW_SEED=1/);
  });

  it("stops demo preparation at the guard before calendar construction or mutation", async () => {
    const resolveDemoSeedNow = vi.fn(() => new Date("2026-07-27T12:00:00.000Z"));
    const transactionHost = {
      $transaction: vi.fn()
    };
    const firstPrismaMutation = vi.fn();

    await expect(
      runPreparedDemoSeed(
        {
          NODE_ENV: "test",
          DATABASE_URL: REMOTE_DB
        },
        transactionHost,
        firstPrismaMutation,
        { resolveDemoSeedNow }
      )
    ).rejects.toThrow(/prod\.example\.com/);

    expect(resolveDemoSeedNow).not.toHaveBeenCalled();
    expect(transactionHost.$transaction).not.toHaveBeenCalled();
    expect(firstPrismaMutation).not.toHaveBeenCalled();
  });
});
