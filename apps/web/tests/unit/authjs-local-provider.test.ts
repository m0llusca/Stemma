import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const now = new Date("2026-05-28T09:30:00.000Z");
const windowStart = new Date("2026-05-28T09:25:00.000Z");

const mocks = vi.hoisted(() => ({
  credentialsProvider: vi.fn((config) => ({
    ...config,
    type: "credentials"
  })),
  prisma: {
    localCredential: {
      findFirst: vi.fn(),
      update: vi.fn()
    }
  },
  verifyLocalPassword: vi.fn()
}));

vi.mock("next-auth/providers/credentials", () => ({
  default: mocks.credentialsProvider
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

describe("Auth.js local credentials provider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.resetModules();
    vi.clearAllMocks();
    mocks.prisma.localCredential.update.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("exports a credentials provider registered with the Auth.js config", async () => {
    const { authorizeLocalCredentials, localCredentialsProvider } = await import("@/auth/providers/local");
    const { authConfig } = await import("@/auth/config");

    expect(mocks.credentialsProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "credentials",
        authorize: authorizeLocalCredentials
      })
    );
    expect(localCredentialsProvider.id).toBe("credentials");
    expect(authConfig.providers).toContain(localCredentialsProvider);
  });

  it("returns the app auth user shape and resets failed counters after successful authorization", async () => {
    mocks.prisma.localCredential.findFirst.mockResolvedValue(
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

    expect(mocks.prisma.localCredential.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          login: "admin.user"
        }
      })
    );
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
    mocks.prisma.localCredential.findFirst.mockResolvedValue(
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

  it("returns null for a locked credential without verifying the password", async () => {
    mocks.prisma.localCredential.findFirst.mockResolvedValue(
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
    expect(mocks.prisma.localCredential.update).not.toHaveBeenCalled();
  });

  it("returns null for inactive users without resetting counters", async () => {
    mocks.prisma.localCredential.findFirst.mockResolvedValue(
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

    expect(mocks.verifyLocalPassword).toHaveBeenCalled();
    expect(mocks.prisma.localCredential.update).not.toHaveBeenCalled();
  });
});
