import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashSessionToken } from "@/lib/auth/session";

const fixedNow = new Date("2026-05-28T09:00:00.000Z");
const futureExpiry = new Date("2026-05-28T21:00:00.000Z");
const pastExpiry = new Date("2026-05-28T08:59:59.000Z");

const mocks = vi.hoisted(() => ({
  prisma: {
    authSession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn()
    },
    user: {
      findUnique: vi.fn()
    }
  }
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

type UserRow = {
  id: string;
  workspaceId: string;
  email: string;
  name: string | null;
  role: "ADMIN" | "TEAM_LEAD" | "QA_ANALYST" | "SUPPORT_AGENT" | "VIEWER";
  lifecycleStatus: "ACTIVE" | "SUSPENDED" | "DEPROVISIONED";
};

type AuthSessionRow = {
  id: string;
  workspaceId: string;
  userId: string;
  sessionTokenHash: string;
  status: "ACTIVE" | "REVOKED" | "EXPIRED";
  expiresAt: Date;
  revokedAt: Date | null;
  lastSeenAt: Date;
  user: UserRow;
};

function userRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: "user-1",
    workspaceId: "workspace-1",
    email: "user@example.com",
    name: "User One",
    role: "ADMIN",
    lifecycleStatus: "ACTIVE",
    ...overrides
  };
}

function authSessionRow(overrides: Partial<AuthSessionRow> = {}): AuthSessionRow {
  const user = overrides.user ?? userRow();

  return {
    id: "session-1",
    workspaceId: user.workspaceId,
    userId: user.id,
    sessionTokenHash: hashSessionToken("raw-session-token"),
    status: "ACTIVE",
    expiresAt: futureExpiry,
    revokedAt: null,
    lastSeenAt: new Date("2026-05-28T08:00:00.000Z"),
    user,
    ...overrides
  };
}

async function createAdapter() {
  const { createQcAuthAdapter } = await import("@/auth/adapter");
  return createQcAuthAdapter();
}

describe("Auth.js AuthSession adapter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("wires the custom adapter into Auth.js config", async () => {
    const { authConfig } = await import("@/auth/config");

    expect(authConfig.adapter).toEqual(
      expect.objectContaining({
        createSession: expect.any(Function),
        getSessionAndUser: expect.any(Function),
        updateSession: expect.any(Function),
        deleteSession: expect.any(Function)
      })
    );
  });

  it("createSession stores a hashed token instead of the raw session token", async () => {
    const adapter = await createAdapter();
    const rawToken = "raw-session-token";
    const hashedToken = hashSessionToken(rawToken);
    mocks.prisma.user.findUnique.mockResolvedValue(userRow());
    mocks.prisma.authSession.create.mockResolvedValue(authSessionRow({ sessionTokenHash: hashedToken }));

    await expect(
      adapter.createSession?.({
        sessionToken: rawToken,
        userId: "user-1",
        expires: futureExpiry
      })
    ).resolves.toEqual({
      sessionToken: rawToken,
      userId: "user-1",
      expires: futureExpiry
    });

    expect(mocks.prisma.authSession.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace-1",
        userId: "user-1",
        sessionTokenHash: hashedToken,
        expiresAt: futureExpiry,
        status: "ACTIVE"
      }
    });
    expect(mocks.prisma.authSession.create.mock.calls[0][0].data.sessionTokenHash).not.toBe(rawToken);
  });

  it("createSession refuses missing or inactive users", async () => {
    const adapter = await createAdapter();

    for (const user of [null, userRow({ lifecycleStatus: "SUSPENDED" }), userRow({ lifecycleStatus: "DEPROVISIONED" })]) {
      mocks.prisma.user.findUnique.mockResolvedValueOnce(user);

      await expect(
        adapter.createSession?.({
          sessionToken: "raw-session-token",
          userId: "user-1",
          expires: futureExpiry
        })
      ).rejects.toThrow();
    }

    expect(mocks.prisma.authSession.create).not.toHaveBeenCalled();
  });

  it("getSessionAndUser refreshes lastSeenAt and maps workspace, role, and emailVerified for active sessions", async () => {
    const adapter = await createAdapter();
    const session = authSessionRow({
      user: userRow({
        name: null,
        role: "TEAM_LEAD"
      })
    });
    mocks.prisma.authSession.findUnique.mockResolvedValue(session);
    mocks.prisma.authSession.update.mockResolvedValue({ ...session, lastSeenAt: fixedNow });

    await expect(adapter.getSessionAndUser?.("raw-session-token")).resolves.toEqual({
      session: {
        sessionToken: "raw-session-token",
        userId: "user-1",
        expires: futureExpiry
      },
      user: {
        id: "user-1",
        workspaceId: "workspace-1",
        email: "user@example.com",
        emailVerified: null,
        name: "user@example.com",
        role: "TEAM_LEAD"
      }
    });

    expect(mocks.prisma.authSession.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionTokenHash: hashSessionToken("raw-session-token") }
      })
    );
    expect(mocks.prisma.authSession.update).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: { lastSeenAt: fixedNow }
    });
  });

  it.each([
    {
      name: "revoked sessions",
      session: authSessionRow({ status: "REVOKED" }),
      expectedUpdate: null
    },
    {
      name: "expired active sessions",
      session: authSessionRow({ expiresAt: pastExpiry }),
      expectedUpdate: {
        status: "EXPIRED"
      }
    },
    {
      name: "suspended users",
      session: authSessionRow({ user: userRow({ lifecycleStatus: "SUSPENDED" }) }),
      expectedUpdate: {
        status: "REVOKED",
        revokedAt: expect.any(Date)
      }
    },
    {
      name: "deprovisioned users",
      session: authSessionRow({ user: userRow({ lifecycleStatus: "DEPROVISIONED" }) }),
      expectedUpdate: {
        status: "REVOKED",
        revokedAt: expect.any(Date)
      }
    }
  ])("getSessionAndUser returns null for $name", async ({ session, expectedUpdate }) => {
    const adapter = await createAdapter();
    mocks.prisma.authSession.findUnique.mockResolvedValue(session);

    await expect(adapter.getSessionAndUser?.("raw-session-token")).resolves.toBeNull();

    if (expectedUpdate) {
      expect(mocks.prisma.authSession.update).toHaveBeenCalledWith({
        where: { id: "session-1" },
        data: expectedUpdate
      });
    } else {
      expect(mocks.prisma.authSession.update).not.toHaveBeenCalled();
    }
  });

  it("deleteSession marks active sessions revoked with revokedAt", async () => {
    const adapter = await createAdapter();
    mocks.prisma.authSession.updateMany.mockResolvedValue({ count: 1 });

    await adapter.deleteSession?.("raw-session-token");

    expect(mocks.prisma.authSession.updateMany).toHaveBeenCalledWith({
      where: {
        sessionTokenHash: hashSessionToken("raw-session-token"),
        status: "ACTIVE"
      },
      data: {
        status: "REVOKED",
        revokedAt: fixedNow
      }
    });
  });

  it("updateSession refreshes expiry and returns the current adapter session", async () => {
    const adapter = await createAdapter();
    const refreshedExpiry = new Date("2026-05-29T09:00:00.000Z");
    mocks.prisma.authSession.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.authSession.findUnique.mockResolvedValue(authSessionRow({ expiresAt: refreshedExpiry }));

    await expect(
      adapter.updateSession?.({
        sessionToken: "raw-session-token",
        expires: refreshedExpiry
      })
    ).resolves.toEqual({
      sessionToken: "raw-session-token",
      userId: "user-1",
      expires: refreshedExpiry
    });

    expect(mocks.prisma.authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sessionTokenHash: hashSessionToken("raw-session-token"),
          status: "ACTIVE"
        }),
        data: expect.objectContaining({
          expiresAt: refreshedExpiry,
          lastSeenAt: fixedNow
        })
      })
    );
  });

  it("updateSession returns null when the session is no longer valid", async () => {
    const adapter = await createAdapter();
    mocks.prisma.authSession.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      adapter.updateSession?.({
        sessionToken: "raw-session-token",
        expires: futureExpiry
      })
    ).resolves.toBeNull();

    expect(mocks.prisma.authSession.findUnique).not.toHaveBeenCalled();
  });
});
