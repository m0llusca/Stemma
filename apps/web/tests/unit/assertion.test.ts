import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAuthSession: vi.fn(),
  prisma: {
    ssoRequestState: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn()
    },
    user: {
      findFirst: vi.fn()
    },
    identityProvider: {
      findFirst: vi.fn()
    },
    $transaction: vi.fn()
  }
}));

vi.mock("@/lib/auth/session", () => ({
  createAuthSession: mocks.createAuthSession
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

const now = new Date("2026-05-28T10:00:00.000Z");
const expiresAt = new Date("2026-05-28T10:01:00.000Z");

function activeAssertionRow(overrides: Record<string, unknown> = {}) {
  return {
    key: "authjs-assertion:assertion-token",
    workspaceId: "workspace-1",
    providerId: "provider-1",
    value: JSON.stringify({
      userId: "user-1",
      expiresAt: expiresAt.toISOString(),
      consumedAt: null
    }),
    expiresAt,
    consumedAt: null,
    ...overrides
  };
}

function activeUser() {
  return {
    id: "user-1",
    workspaceId: "workspace-1",
    email: "agent@example.com",
    name: "Agent One",
    role: "SUPPORT_AGENT"
  };
}

function activeProvider() {
  return {
    id: "provider-1",
    workspaceId: "workspace-1",
    status: "active"
  };
}

describe("enterprise assertion helpers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it("creates a short-lived provider-scoped assertion state", async () => {
    mocks.prisma.ssoRequestState.create.mockResolvedValue({});
    const { createEnterpriseAssertion } = await import("@/auth/providers/assertion");

    const assertion = await createEnterpriseAssertion({
      workspaceId: "workspace-1",
      providerId: "provider-1",
      userId: "user-1"
    });

    expect(assertion.token).toEqual(expect.any(String));
    expect(assertion.key).toBe(`authjs-assertion:${assertion.token}`);
    expect(assertion.expiresAt).toEqual(expiresAt);
    expect(mocks.prisma.ssoRequestState.create).toHaveBeenCalledWith({
      data: {
        key: assertion.key,
        workspaceId: "workspace-1",
        providerId: "provider-1",
        value: expect.any(String),
        expiresAt,
        consumedAt: null
      }
    });
    expect(JSON.parse(mocks.prisma.ssoRequestState.create.mock.calls[0][0].data.value)).toEqual({
      userId: "user-1",
      expiresAt: expiresAt.toISOString(),
      consumedAt: null
    });
  });

  it("consumes an active assertion once and returns the active user with provider scope", async () => {
    mocks.prisma.ssoRequestState.findUnique.mockResolvedValue(activeAssertionRow());
    mocks.prisma.ssoRequestState.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.user.findFirst.mockResolvedValue(activeUser());
    mocks.prisma.identityProvider.findFirst.mockResolvedValue(activeProvider());

    const { consumeEnterpriseAssertion } = await import("@/auth/providers/assertion");

    await expect(consumeEnterpriseAssertion({ token: "assertion-token", providerId: "provider-1" })).resolves.toEqual({
      user: activeUser(),
      providerId: "provider-1"
    });
    expect(mocks.prisma.ssoRequestState.findUnique).toHaveBeenCalledWith({
      where: { key: "authjs-assertion:assertion-token" }
    });
    expect(mocks.prisma.ssoRequestState.updateMany).toHaveBeenCalledWith({
      where: {
        key: "authjs-assertion:assertion-token",
        workspaceId: "workspace-1",
        providerId: "provider-1",
        consumedAt: null,
        expiresAt: { gt: now }
      },
      data: {
        consumedAt: now,
        value: JSON.stringify({
          userId: "user-1",
          expiresAt: expiresAt.toISOString(),
          consumedAt: now.toISOString()
        })
      }
    });
    expect(mocks.prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: "user-1",
        workspaceId: "workspace-1",
        lifecycleStatus: "ACTIVE"
      },
      select: {
        id: true,
        workspaceId: true,
        email: true,
        name: true,
        role: true
      }
    });
    expect(mocks.prisma.identityProvider.findFirst).toHaveBeenCalledWith({
      where: {
        id: "provider-1",
        workspaceId: "workspace-1",
        status: "active"
      },
      select: { id: true }
    });
  });

  it("returns null when an assertion was already consumed by another transaction", async () => {
    mocks.prisma.ssoRequestState.findUnique.mockResolvedValue(activeAssertionRow());
    mocks.prisma.ssoRequestState.updateMany.mockResolvedValue({ count: 0 });

    const { consumeEnterpriseAssertion } = await import("@/auth/providers/assertion");

    await expect(consumeEnterpriseAssertion({ token: "assertion-token", providerId: "provider-1" })).resolves.toBeNull();
    expect(mocks.prisma.user.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.identityProvider.findFirst).not.toHaveBeenCalled();
  });

  it("returns null without consuming when the supplied provider does not match the assertion", async () => {
    mocks.prisma.ssoRequestState.findUnique.mockResolvedValue(activeAssertionRow());

    const { consumeEnterpriseAssertion } = await import("@/auth/providers/assertion");

    await expect(consumeEnterpriseAssertion({ token: "assertion-token", providerId: "provider-2" })).resolves.toBeNull();
    expect(mocks.prisma.ssoRequestState.updateMany).not.toHaveBeenCalled();
  });

  it("returns null for expired or consumed assertions", async () => {
    const { consumeEnterpriseAssertion } = await import("@/auth/providers/assertion");

    mocks.prisma.ssoRequestState.findUnique.mockResolvedValueOnce(
      activeAssertionRow({
        expiresAt: new Date("2026-05-28T09:59:59.999Z")
      })
    );
    await expect(consumeEnterpriseAssertion({ token: "assertion-token", providerId: "provider-1" })).resolves.toBeNull();

    mocks.prisma.ssoRequestState.findUnique.mockResolvedValueOnce(
      activeAssertionRow({
        consumedAt: new Date("2026-05-28T09:59:00.000Z")
      })
    );
    await expect(consumeEnterpriseAssertion({ token: "assertion-token", providerId: "provider-1" })).resolves.toBeNull();

    expect(mocks.prisma.ssoRequestState.updateMany).not.toHaveBeenCalled();
  });

  it("consumes but rejects assertions whose user or provider is no longer active", async () => {
    const { consumeEnterpriseAssertion } = await import("@/auth/providers/assertion");

    mocks.prisma.ssoRequestState.findUnique.mockResolvedValueOnce(activeAssertionRow());
    mocks.prisma.ssoRequestState.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.user.findFirst.mockResolvedValueOnce(null);
    mocks.prisma.identityProvider.findFirst.mockResolvedValueOnce(activeProvider());
    await expect(consumeEnterpriseAssertion({ token: "assertion-token", providerId: "provider-1" })).resolves.toBeNull();

    mocks.prisma.ssoRequestState.findUnique.mockResolvedValueOnce(activeAssertionRow({ key: "authjs-assertion:assertion-token-2" }));
    mocks.prisma.user.findFirst.mockResolvedValueOnce(activeUser());
    mocks.prisma.identityProvider.findFirst.mockResolvedValueOnce(null);
    await expect(consumeEnterpriseAssertion({ token: "assertion-token-2", providerId: "provider-1" })).resolves.toBeNull();

    expect(mocks.prisma.ssoRequestState.updateMany).toHaveBeenCalledTimes(2);
  });

  it("issues an auth session only after successful assertion consumption", async () => {
    const sessionResult = {
      token: "session-token",
      session: { id: "session-1", userId: "user-1", providerId: "provider-1" }
    };
    mocks.prisma.ssoRequestState.findUnique.mockResolvedValue(activeAssertionRow());
    mocks.prisma.ssoRequestState.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.user.findFirst.mockResolvedValue(activeUser());
    mocks.prisma.identityProvider.findFirst.mockResolvedValue(activeProvider());
    mocks.createAuthSession.mockResolvedValue(sessionResult);

    const { issueSessionFromEnterpriseAssertion } = await import("@/auth/providers/assertion");

    await expect(
      issueSessionFromEnterpriseAssertion({
        token: "assertion-token",
        providerId: "provider-1",
        userAgent: "vitest",
        ipAddress: "203.0.113.10"
      })
    ).resolves.toBe(sessionResult);
    expect(mocks.createAuthSession).toHaveBeenCalledWith({
      userId: "user-1",
      providerId: "provider-1",
      userAgent: "vitest",
      ipAddress: "203.0.113.10"
    });
  });

  it("does not export an Auth.js Credentials provider for enterprise assertions", async () => {
    const assertionModule = await import("@/auth/providers/assertion");

    expect("enterpriseAssertionProvider" in assertionModule).toBe(false);
  });
});
