import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertCanPersistSettings: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
  requireCurrentUserPermission: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    authSession: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn()
    },
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn()
    },
    identityProvider: {
      findFirst: vi.fn()
    },
    auditLog: {
      create: vi.fn()
    }
  }
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect
}));

vi.mock("@/lib/current-user", () => ({
  assertCanPersistSettings: mocks.assertCanPersistSettings,
  requireCurrentUserPermission: mocks.requireCurrentUserPermission
}));

describe("auth session lifecycle hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
    mocks.requireCurrentUserPermission.mockResolvedValue({ id: "actor-1", workspaceId: "workspace-1" });
    mocks.assertCanPersistSettings.mockResolvedValue(undefined);
    mocks.prisma.authSession.findFirst.mockResolvedValue(null);
    mocks.prisma.authSession.updateMany.mockResolvedValue({ count: 0 });
    mocks.prisma.user.findFirst.mockResolvedValue({ id: "user-1" });
    mocks.prisma.identityProvider.findFirst.mockResolvedValue({ id: "provider-1" });
    mocks.prisma.auditLog.create.mockResolvedValue({});
  });

  it("exports all Auth.js and legacy NextAuth cookies that logout must clear", async () => {
    const { authJsSessionCookieNames } = await import("@/lib/auth/session");

    expect(authJsSessionCookieNames).toEqual([
      "authjs.session-token",
      "__Secure-authjs.session-token",
      "next-auth.session-token",
      "__Secure-next-auth.session-token",
      "authjs.callback-url",
      "__Secure-authjs.callback-url",
      "authjs.csrf-token",
      "__Host-authjs.csrf-token"
    ]);
  });

  it("blocks new sessions for suspended users", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      workspaceId: "workspace-1",
      lifecycleStatus: "SUSPENDED"
    });
    const { createAuthSession } = await import("@/lib/auth/session");

    await expect(createAuthSession({ userId: "user-1" })).rejects.toThrow("Пользователь приостановлен или деактивирован.");
    expect(mocks.prisma.authSession.create).not.toHaveBeenCalled();
  });

  it("revokes an active session when the user is no longer active", async () => {
    const future = new Date(Date.now() + 60_000);
    mocks.prisma.authSession.findUnique.mockResolvedValue({
      id: "session-1",
      status: "ACTIVE",
      expiresAt: future,
      user: {
        lifecycleStatus: "DEPROVISIONED"
      }
    });
    const { getValidAuthSession } = await import("@/lib/auth/session");

    await expect(getValidAuthSession("session-token")).resolves.toBeNull();
    expect(mocks.prisma.authSession.update).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: {
        status: "REVOKED",
        revokedAt: expect.any(Date)
      }
    });
  });

  it("revokes active sessions for lifecycle actions and writes redacted audit-safe metadata", async () => {
    mocks.prisma.authSession.updateMany.mockResolvedValue({ count: 2 });
    const { revokeActiveSessionsForUser } = await import("@/lib/auth/session");

    await expect(
      revokeActiveSessionsForUser({
        userId: "user-1",
        workspaceId: "workspace-1",
        actorId: "actor-1",
        reason: "deprovisioned"
      })
    ).resolves.toBe(2);

    expect(mocks.prisma.authSession.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        status: "ACTIVE",
        workspaceId: "workspace-1"
      },
      data: {
        status: "REVOKED",
        revokedAt: expect.any(Date)
      }
    });
    expect(mocks.prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "auth.sessions_revoked_for_user",
        metadata: JSON.stringify({
          reason: "deprovisioned",
          revokedSessionCount: 2
        })
      })
    });
  });

  it("admin revocation marks an active AuthSession row revoked without deleting it", async () => {
    mocks.prisma.authSession.findFirst.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      providerId: "provider-1"
    });
    mocks.prisma.authSession.update.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      providerId: "provider-1"
    });
    const formData = new FormData();
    formData.set("sessionId", "session-1");
    const { revokeAuthSessionById } = await import("@/lib/auth-provider-actions");

    await revokeAuthSessionById(formData);

    expect(mocks.prisma.authSession.findFirst).toHaveBeenCalledWith({
      where: {
        id: "session-1",
        workspaceId: "workspace-1",
        status: "ACTIVE"
      }
    });
    expect(mocks.prisma.authSession.update).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: {
        status: "REVOKED",
        revokedAt: expect.any(Date)
      }
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/access");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/system");
  });

  it("updates lifecycle status, revokes sessions, and audits the lifecycle change", async () => {
    mocks.prisma.user.update.mockResolvedValue({
      id: "user-1",
      workspaceId: "workspace-1",
      lifecycleStatus: "DEPROVISIONED",
      sourceOfTruthProviderId: "provider-1"
    });
    mocks.prisma.authSession.updateMany.mockResolvedValue({ count: 1 });
    const { applyUserLifecycleStatus } = await import("@/lib/auth/session");

    await expect(
      applyUserLifecycleStatus({
        userId: "user-1",
        workspaceId: "workspace-1",
        actorId: "actor-1",
        status: "DEPROVISIONED",
        sourceOfTruthProviderId: "provider-1",
        reason: "SCIM delete"
      })
    ).resolves.toMatchObject({
      revokedSessionCount: 1
    });

    expect(mocks.prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: expect.objectContaining({
        lifecycleStatus: "DEPROVISIONED",
        deprovisionedAt: expect.any(Date),
        sourceOfTruthProviderId: "provider-1"
      }),
      select: {
        id: true,
        workspaceId: true,
        lifecycleStatus: true,
        sourceOfTruthProviderId: true
      }
    });
    expect(mocks.prisma.auditLog.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        action: "auth.user_lifecycle_updated",
        metadata: JSON.stringify({
          status: "DEPROVISIONED",
          sourceOfTruthProviderId: "provider-1",
          revokedSessionCount: 1
        })
      })
    });
    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
  });

  it("validates source-of-truth provider workspace before changing lifecycle", async () => {
    mocks.prisma.identityProvider.findFirst.mockResolvedValue(null);
    const { applyUserLifecycleStatus } = await import("@/lib/auth/session");

    await expect(
      applyUserLifecycleStatus({
        userId: "user-1",
        workspaceId: "workspace-1",
        actorId: "actor-1",
        status: "SUSPENDED",
        sourceOfTruthProviderId: "provider-from-other-workspace"
      })
    ).rejects.toThrow("Провайдер источника истины не найден в рабочем пространстве.");

    expect(mocks.prisma.identityProvider.findFirst).toHaveBeenCalledWith({
      where: {
        id: "provider-from-other-workspace",
        workspaceId: "workspace-1"
      },
      select: { id: true }
    });
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });
});
