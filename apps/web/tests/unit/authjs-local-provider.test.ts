import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const now = new Date("2026-05-28T09:30:00.000Z");
const windowStart = new Date("2026-05-28T09:25:00.000Z");

const mocks = vi.hoisted(() => ({
  prisma: {
    $executeRawUnsafe: vi.fn(),
    $transaction: vi.fn(),
    localCredential: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn()
    }
  },
  verifyLocalPassword: vi.fn()
}));

vi.mock("@/lib/auth/local-credentials", () => ({
  normalizeLocalLogin: (value: string) => value.trim().toLowerCase(),
  verifyLocalPassword: mocks.verifyLocalPassword
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

function activeCredential(overrides: Record<string, unknown> = {}) {
  return {
    id: "credential-1",
    workspaceId: "workspace-1",
    userId: "user-1",
    login: "admin.user",
    passwordHash: "hashed-password",
    passwordSalt: "salt-value",
    keyVersion: "scrypt-v1",
    lastLoginAt: null,
    failedLoginCount: 0,
    failedLoginWindowStart: null,
    lastFailedLoginAt: null,
    lockedUntil: null,
    user: {
      id: "user-1",
      workspaceId: "workspace-1",
      email: "admin@example.com",
      name: "Admin User",
      role: "ADMIN",
      lifecycleStatus: "ACTIVE"
    },
    ...overrides
  };
}

describe("local credentials authorization", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.resetModules();
    vi.clearAllMocks();
    mocks.prisma.$executeRawUnsafe.mockResolvedValue(0);
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
    mocks.prisma.localCredential.findUnique.mockImplementation(async ({ where }) => activeCredential({ id: where.id }));
    mocks.prisma.localCredential.update.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps local credentials as a domain authorizer, not an Auth.js Credentials provider", async () => {
    const localModule = await import("@/auth/providers/local");
    const { authConfig } = await import("@/auth/config");

    expect(localModule.authorizeLocalCredentials).toEqual(expect.any(Function));
    expect("localCredentialsProvider" in localModule).toBe(false);
    expect(authConfig.session?.strategy).toBe("database");
    expect(authConfig.providers).toEqual([]);
  });

  it("returns the app auth user shape and resets failed counters after successful authorization", async () => {
    mocks.prisma.localCredential.findMany.mockResolvedValue([
      activeCredential({
        failedLoginCount: 3,
        failedLoginWindowStart: windowStart,
        lastFailedLoginAt: windowStart
      })
    ]);
    mocks.prisma.localCredential.findUnique.mockResolvedValueOnce(
      activeCredential({
        failedLoginCount: 3,
        failedLoginWindowStart: windowStart,
        lastFailedLoginAt: windowStart
      })
    );
    mocks.verifyLocalPassword.mockResolvedValue(true);
    const { authorizeLocalCredentials } = await import("@/auth/providers/local");

    const result = await authorizeLocalCredentials({
      login: " Admin.User ",
      password: " local-password-123 "
    });

    expect(mocks.prisma.localCredential.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          login: "admin.user"
        },
        take: 2
      })
    );
    expect(mocks.prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      "local_credential:credential-1"
    );
    expect(mocks.prisma.localCredential.findUnique).toHaveBeenCalledWith({
      where: { id: "credential-1" },
      select: expect.objectContaining({
        passwordHash: true,
        lockedUntil: true
      })
    });
    expect(mocks.verifyLocalPassword).toHaveBeenCalledWith({
      password: "local-password-123",
      passwordHash: "hashed-password",
      passwordSalt: "salt-value",
      keyVersion: "scrypt-v1"
    });
    expect(result).toEqual({
      id: "user-1",
      workspaceId: "workspace-1",
      email: "admin@example.com",
      name: "Admin User",
      role: "ADMIN"
    });
    expect(mocks.prisma.localCredential.update).toHaveBeenCalledWith({
      where: {
        id: "credential-1"
      },
      data: {
        lastLoginAt: now,
        failedLoginCount: 0,
        failedLoginWindowStart: null,
        lastFailedLoginAt: null,
        lockedUntil: null
      }
    });
  });

  it("records failed counters and returns null for a password mismatch", async () => {
    mocks.prisma.localCredential.findMany.mockResolvedValue([
      activeCredential({
        failedLoginCount: 1,
        failedLoginWindowStart: windowStart,
        lastFailedLoginAt: windowStart
      })
    ]);
    mocks.prisma.localCredential.findUnique.mockResolvedValueOnce(
      activeCredential({
        failedLoginCount: 1,
        failedLoginWindowStart: windowStart,
        lastFailedLoginAt: windowStart
      })
    );
    mocks.verifyLocalPassword.mockResolvedValue(false);
    const { authorizeLocalCredentials } = await import("@/auth/providers/local");

    await expect(
      authorizeLocalCredentials({
        login: "admin.user",
        password: "wrong-password"
      })
    ).resolves.toBeNull();

    expect(mocks.prisma.localCredential.update).toHaveBeenCalledWith({
      where: {
        id: "credential-1"
      },
      data: {
        failedLoginCount: 2,
        failedLoginWindowStart: windowStart,
        lastFailedLoginAt: now,
        lockedUntil: null
      }
    });
  });

  it("serializes failed counter updates by reloading the credential under an advisory lock", async () => {
    mocks.prisma.localCredential.findMany.mockResolvedValue([
      activeCredential({
        failedLoginCount: 1,
        failedLoginWindowStart: windowStart
      })
    ]);
    mocks.prisma.localCredential.findUnique.mockResolvedValueOnce(
      activeCredential({
        failedLoginCount: 4,
        failedLoginWindowStart: windowStart
      })
    );
    mocks.verifyLocalPassword.mockResolvedValue(false);
    const { authorizeLocalCredentials } = await import("@/auth/providers/local");

    await expect(
      authorizeLocalCredentials({
        login: "admin.user",
        password: "wrong-password"
      })
    ).resolves.toBeNull();

    expect(mocks.prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      "local_credential:credential-1"
    );
    expect(mocks.prisma.localCredential.findUnique).toHaveBeenCalledWith({
      where: { id: "credential-1" },
      select: expect.objectContaining({
        failedLoginCount: true,
        lockedUntil: true
      })
    });
    expect(mocks.verifyLocalPassword).toHaveBeenCalledWith({
      password: "wrong-password",
      passwordHash: "hashed-password",
      passwordSalt: "salt-value",
      keyVersion: "scrypt-v1"
    });
    expect(mocks.prisma.localCredential.update).toHaveBeenCalledWith({
      where: {
        id: "credential-1"
      },
      data: {
        failedLoginCount: 5,
        failedLoginWindowStart: windowStart,
        lastFailedLoginAt: now,
        lockedUntil: new Date("2026-05-28T09:45:00.000Z")
      }
    });
  });

  it("returns null for a locked credential without verifying the password", async () => {
    mocks.prisma.localCredential.findMany.mockResolvedValue([
      activeCredential({
        failedLoginCount: 5,
        failedLoginWindowStart: windowStart,
        lockedUntil: new Date("2026-05-28T09:40:00.000Z")
      })
    ]);
    mocks.prisma.localCredential.findUnique.mockResolvedValueOnce(
      activeCredential({
        failedLoginCount: 5,
        failedLoginWindowStart: windowStart,
        lockedUntil: new Date("2026-05-28T09:40:00.000Z")
      })
    );
    const { authorizeLocalCredentials } = await import("@/auth/providers/local");

    await expect(
      authorizeLocalCredentials({
        login: "admin.user",
        password: "local-password-123"
      })
    ).resolves.toBeNull();

    expect(mocks.verifyLocalPassword).not.toHaveBeenCalled();
    expect(mocks.prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      "local_credential:credential-1"
    );
    expect(mocks.prisma.localCredential.update).not.toHaveBeenCalled();
  });

  it("returns null for duplicate local credential logins without verifying the password", async () => {
    mocks.prisma.localCredential.findMany.mockResolvedValue([
      activeCredential(),
      activeCredential({
        id: "credential-2",
        user: {
          id: "user-2",
          workspaceId: "workspace-2",
          email: "admin@second.example",
          name: "Second Admin",
          role: "ADMIN",
          lifecycleStatus: "ACTIVE"
        }
      })
    ]);
    const { authorizeLocalCredentials } = await import("@/auth/providers/local");

    await expect(
      authorizeLocalCredentials({
        login: " Admin.User ",
        password: "local-password-123"
      })
    ).resolves.toBeNull();

    expect(mocks.prisma.localCredential.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          login: "admin.user"
        },
        take: 2
      })
    );
    expect(mocks.verifyLocalPassword).not.toHaveBeenCalled();
    expect(mocks.prisma.localCredential.update).not.toHaveBeenCalled();
  });

  it("returns null for inactive users without resetting counters", async () => {
    mocks.prisma.localCredential.findMany.mockResolvedValue([
      activeCredential({
        user: {
          id: "user-1",
          workspaceId: "workspace-1",
          email: "admin@example.com",
          name: "Admin User",
          role: "ADMIN",
          lifecycleStatus: "SUSPENDED"
        }
      })
    ]);
    mocks.prisma.localCredential.findUnique.mockResolvedValueOnce(
      activeCredential({
        user: {
          id: "user-1",
          workspaceId: "workspace-1",
          email: "admin@example.com",
          name: "Admin User",
          role: "ADMIN",
          lifecycleStatus: "SUSPENDED"
        }
      })
    );
    mocks.verifyLocalPassword.mockResolvedValue(true);
    const { authorizeLocalCredentials } = await import("@/auth/providers/local");

    await expect(
      authorizeLocalCredentials({
        login: "admin.user",
        password: "local-password-123"
      })
    ).resolves.toBeNull();

    expect(mocks.verifyLocalPassword).not.toHaveBeenCalled();
    expect(mocks.prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      "local_credential:credential-1"
    );
    expect(mocks.prisma.localCredential.update).not.toHaveBeenCalled();
  });
});
