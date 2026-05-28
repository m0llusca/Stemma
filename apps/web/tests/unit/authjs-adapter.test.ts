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
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn()
    },
    identityProvider: {
      findFirst: vi.fn()
    },
    externalIdentity: {
      findUnique: vi.fn(),
      upsert: vi.fn()
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

type ExternalIdentityRow = {
  id: string;
  userId: string;
  providerId: string;
  providerSubject: string;
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

function externalIdentityRow(overrides: Partial<ExternalIdentityRow> = {}): ExternalIdentityRow {
  const user = overrides.user ?? userRow();

  return {
    id: "identity-1",
    userId: user.id,
    providerId: "provider-1",
    providerSubject: "subject-1",
    user,
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
        getUser: expect.any(Function),
        getUserByEmail: expect.any(Function),
        getUserByAccount: expect.any(Function),
        updateUser: expect.any(Function),
        linkAccount: expect.any(Function),
        getSessionAndUser: expect.any(Function),
        updateSession: expect.any(Function),
        deleteSession: expect.any(Function)
      })
    );
  });

  it("getUser maps active local users and ignores inactive users", async () => {
    const adapter = await createAdapter();
    mocks.prisma.user.findUnique.mockResolvedValueOnce(
      userRow({
        name: null,
        role: "QA_ANALYST"
      })
    );

    expect(adapter.getUser).toEqual(expect.any(Function));
    await expect(adapter.getUser?.("user-1")).resolves.toEqual({
      id: "user-1",
      workspaceId: "workspace-1",
      email: "user@example.com",
      emailVerified: null,
      name: "user@example.com",
      role: "QA_ANALYST"
    });

    mocks.prisma.user.findUnique.mockResolvedValueOnce(userRow({ lifecycleStatus: "SUSPENDED" }));

    await expect(adapter.getUser?.("user-1")).resolves.toBeNull();
    expect(mocks.prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: expect.objectContaining({
        workspaceId: true,
        lifecycleStatus: true
      })
    });
  });

  it("getUserByAccount maps provider account ownership to an active user", async () => {
    const adapter = await createAdapter();
    mocks.prisma.externalIdentity.findUnique.mockResolvedValue(
      externalIdentityRow({
        providerId: "provider-1",
        providerSubject: "subject-1",
        user: userRow({ role: "TEAM_LEAD" })
      })
    );

    expect(adapter.getUserByAccount).toEqual(expect.any(Function));
    await expect(
      adapter.getUserByAccount?.({
        provider: "provider-1",
        providerAccountId: "subject-1"
      })
    ).resolves.toEqual({
      id: "user-1",
      workspaceId: "workspace-1",
      email: "user@example.com",
      emailVerified: null,
      name: "User One",
      role: "TEAM_LEAD"
    });

    expect(mocks.prisma.externalIdentity.findUnique).toHaveBeenCalledWith({
      where: {
        providerId_providerSubject: {
          providerId: "provider-1",
          providerSubject: "subject-1"
        }
      },
      include: {
        user: {
          select: expect.objectContaining({
            workspaceId: true,
            lifecycleStatus: true
          })
        }
      }
    });
  });

  it("getUserByAccount returns null when ownership is missing or inactive", async () => {
    const adapter = await createAdapter();
    mocks.prisma.externalIdentity.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(externalIdentityRow({ user: userRow({ lifecycleStatus: "DEPROVISIONED" }) }));

    expect(adapter.getUserByAccount).toEqual(expect.any(Function));
    await expect(adapter.getUserByAccount?.({ provider: "provider-1", providerAccountId: "subject-1" })).resolves.toBeNull();
    await expect(adapter.getUserByAccount?.({ provider: "provider-1", providerAccountId: "subject-1" })).resolves.toBeNull();
  });

  it("getUserByEmail maps a globally unique active user and rejects ambiguous emails", async () => {
    const adapter = await createAdapter();
    mocks.prisma.user.findMany
      .mockResolvedValueOnce([userRow({ email: "user@example.com", role: "VIEWER" })])
      .mockResolvedValueOnce([userRow({ id: "user-1" }), userRow({ id: "user-2", email: "user@example.com" })]);

    expect(adapter.getUserByEmail).toEqual(expect.any(Function));
    await expect(adapter.getUserByEmail?.(" User@Example.Com ")).resolves.toEqual({
      id: "user-1",
      workspaceId: "workspace-1",
      email: "user@example.com",
      emailVerified: null,
      name: "User One",
      role: "VIEWER"
    });
    await expect(adapter.getUserByEmail?.("user@example.com")).resolves.toBeNull();

    expect(mocks.prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        email: "user@example.com",
        lifecycleStatus: "ACTIVE"
      },
      take: 2,
      select: expect.objectContaining({
        workspaceId: true,
        lifecycleStatus: true
      })
    });
  });

  it("createUser refuses Auth.js users without an explicit workspace assignment", async () => {
    const adapter = await createAdapter();

    expect(adapter.createUser).toEqual(expect.any(Function));
    await expect(
      adapter.createUser?.({
        id: "created-user",
        email: "new@example.com",
        emailVerified: null,
        name: "New User",
        role: "QA_ANALYST"
      } as Parameters<NonNullable<typeof adapter.createUser>>[0])
    ).rejects.toThrow(/workspaceId/i);

    expect(mocks.prisma.user.create).not.toHaveBeenCalled();
  });

  it("createUser creates an active user only when workspace, email, and role are explicit", async () => {
    const adapter = await createAdapter();
    mocks.prisma.user.create.mockResolvedValue(
      userRow({
        id: "created-user",
        email: "new@example.com",
        name: "New User",
        role: "QA_ANALYST"
      })
    );

    expect(adapter.createUser).toEqual(expect.any(Function));
    await expect(
      adapter.createUser?.({
        id: "created-user",
        workspaceId: "workspace-1",
        email: "new@example.com",
        emailVerified: null,
        name: "New User",
        role: "QA_ANALYST"
      })
    ).resolves.toEqual({
      id: "created-user",
      workspaceId: "workspace-1",
      email: "new@example.com",
      emailVerified: null,
      name: "New User",
      role: "QA_ANALYST"
    });

    expect(mocks.prisma.user.create).toHaveBeenCalledWith({
      data: {
        id: "created-user",
        workspaceId: "workspace-1",
        email: "new@example.com",
        name: "New User",
        role: "QA_ANALYST",
        lifecycleStatus: "ACTIVE"
      },
      select: expect.objectContaining({
        workspaceId: true,
        lifecycleStatus: true
      })
    });
  });

  it("updateUser updates only the existing active user in place", async () => {
    const adapter = await createAdapter();
    mocks.prisma.user.findUnique.mockResolvedValue(userRow({ role: "SUPPORT_AGENT" }));
    mocks.prisma.user.update.mockResolvedValue(
      userRow({
        email: "updated@example.com",
        name: "Updated User",
        role: "QA_ANALYST"
      })
    );

    expect(adapter.updateUser).toEqual(expect.any(Function));
    await expect(
      adapter.updateUser?.({
        id: "user-1",
        workspaceId: "workspace-1",
        email: " Updated@Example.Com ",
        name: " Updated User ",
        role: "QA_ANALYST"
      })
    ).resolves.toEqual({
      id: "user-1",
      workspaceId: "workspace-1",
      email: "updated@example.com",
      emailVerified: null,
      name: "Updated User",
      role: "QA_ANALYST"
    });

    expect(mocks.prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        email: "updated@example.com",
        name: "Updated User",
        role: "QA_ANALYST"
      },
      select: expect.objectContaining({
        workspaceId: true,
        lifecycleStatus: true
      })
    });
  });

  it("updateUser refuses inactive users and workspace moves", async () => {
    const adapter = await createAdapter();
    mocks.prisma.user.findUnique.mockResolvedValueOnce(null);

    await expect(adapter.updateUser?.({ id: "missing-user", name: "Missing" })).rejects.toThrow(/missing or inactive/i);

    mocks.prisma.user.findUnique.mockResolvedValueOnce(userRow());

    await expect(
      adapter.updateUser?.({
        id: "user-1",
        workspaceId: "workspace-2"
      })
    ).rejects.toThrow(/between workspaces/i);

    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });

  it("linkAccount validates user and provider ownership before upserting an external identity", async () => {
    const adapter = await createAdapter();
    const account = {
      userId: "user-1",
      type: "oidc" as const,
      provider: "provider-1",
      providerAccountId: "subject-1"
    };
    mocks.prisma.user.findUnique.mockResolvedValue(userRow({ name: "User One" }));
    mocks.prisma.identityProvider.findFirst.mockResolvedValue({ id: "provider-1" });
    mocks.prisma.externalIdentity.findUnique.mockResolvedValue(null);
    mocks.prisma.externalIdentity.upsert.mockResolvedValue(externalIdentityRow());

    expect(adapter.linkAccount).toEqual(expect.any(Function));
    await expect(adapter.linkAccount?.(account)).resolves.toEqual(account);

    expect(mocks.prisma.identityProvider.findFirst).toHaveBeenCalledWith({
      where: {
        id: "provider-1",
        workspaceId: "workspace-1",
        status: "active"
      },
      select: { id: true }
    });
    expect(mocks.prisma.externalIdentity.upsert).toHaveBeenCalledWith({
      where: {
        providerId_providerSubject: {
          providerId: "provider-1",
          providerSubject: "subject-1"
        }
      },
      update: {
        userId: "user-1",
        email: "user@example.com",
        displayName: "User One",
        disabledAt: null
      },
      create: {
        userId: "user-1",
        providerId: "provider-1",
        providerSubject: "subject-1",
        email: "user@example.com",
        displayName: "User One"
      }
    });
  });

  it("linkAccount refuses to create orphan identities for missing users or providers", async () => {
    const adapter = await createAdapter();
    const account = {
      userId: "user-1",
      type: "oidc" as const,
      provider: "provider-1",
      providerAccountId: "subject-1"
    };

    expect(adapter.linkAccount).toEqual(expect.any(Function));
    mocks.prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(adapter.linkAccount?.(account)).rejects.toThrow(/missing or inactive/i);

    mocks.prisma.user.findUnique.mockResolvedValueOnce(userRow());
    mocks.prisma.identityProvider.findFirst.mockResolvedValueOnce(null);
    await expect(adapter.linkAccount?.(account)).rejects.toThrow(/provider/i);

    expect(mocks.prisma.externalIdentity.upsert).not.toHaveBeenCalled();
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
