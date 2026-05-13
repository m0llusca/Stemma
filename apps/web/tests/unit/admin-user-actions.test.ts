import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const prisma = {
    $transaction: vi.fn(),
    user: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn()
    },
    localCredential: {
      create: vi.fn(),
      findFirst: vi.fn()
    }
  };

  return {
    auditLog: vi.fn(),
    assertCanPersistSettings: vi.fn(),
    hashLocalPassword: vi.fn(),
    prisma,
    requireCurrentUserPermission: vi.fn(),
    redirect: vi.fn(),
    revalidatePath: vi.fn()
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect
}));

vi.mock("@/lib/audit", () => ({
  auditLog: mocks.auditLog
}));

vi.mock("@/lib/auth/local-credentials", () => ({
  hashLocalPassword: mocks.hashLocalPassword,
  normalizeLocalLogin: (value: string) => value.trim().toLowerCase()
}));

vi.mock("@/lib/current-user", () => ({
  assertCanPersistSettings: mocks.assertCanPersistSettings,
  requireCurrentUserPermission: mocks.requireCurrentUserPermission
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

function adminUser() {
  return {
    id: "admin-1",
    workspaceId: "workspace-1",
    role: "ADMIN"
  };
}

describe("admin user actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertCanPersistSettings.mockResolvedValue(undefined);
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
    mocks.requireCurrentUserPermission.mockResolvedValue(adminUser());
    mocks.hashLocalPassword.mockResolvedValue({
      passwordHash: "hashed-password",
      passwordSalt: "salt-value",
      keyVersion: "scrypt-v1"
    });
    mocks.auditLog.mockResolvedValue({});
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    mocks.prisma.user.findFirst.mockResolvedValue({
      id: "user-2",
      workspaceId: "workspace-1",
      role: "QA_ANALYST"
    });
    mocks.prisma.user.count.mockResolvedValue(2);
    mocks.prisma.user.create.mockResolvedValue({
      id: "user-2",
      email: "new.user@example.com",
      name: "Новый пользователь",
      role: "QA_ANALYST"
    });
    mocks.prisma.user.update.mockResolvedValue({
      id: "user-2",
      role: "TEAM_LEAD"
    });
    mocks.prisma.localCredential.findFirst.mockResolvedValue(null);
    mocks.prisma.localCredential.create.mockResolvedValue({
      id: "credential-1"
    });
  });

  it("creates a local user with a hashed password and assigned role", async () => {
    const { createLocalUser } = await import("@/lib/admin-user-actions");
    const formData = new FormData();
    formData.set("name", " Новый пользователь ");
    formData.set("email", " New.User@Example.Com ");
    formData.set("login", " New.User ");
    formData.set("password", "local-password-123");
    formData.set("role", "QA_ANALYST");
    formData.set("teamName", "Контроль качества");
    formData.set("supportLine", "B2B");

    await createLocalUser(formData);

    expect(mocks.requireCurrentUserPermission).toHaveBeenCalledWith("users:manage");
    expect(mocks.hashLocalPassword).toHaveBeenCalledWith("local-password-123");
    expect(mocks.prisma.user.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace-1",
        email: "new.user@example.com",
        name: "Новый пользователь",
        role: "QA_ANALYST",
        teamName: "Контроль качества",
        supportLine: "B2B"
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true
      }
    });
    expect(mocks.prisma.localCredential.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace-1",
        userId: "user-2",
        login: "new.user",
        passwordHash: "hashed-password",
        passwordSalt: "salt-value",
        keyVersion: "scrypt-v1"
      }
    });
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.local_user_created",
        targetType: "user",
        targetId: "user-2",
        metadata: expect.objectContaining({
          email: "new.user@example.com",
          login: "new.user",
          role: "QA_ANALYST"
        })
      }),
      mocks.prisma
    );
    expect(JSON.stringify(mocks.prisma.localCredential.create.mock.calls[0][0])).not.toContain("local-password-123");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/users");
  });

  it("returns to the user directory after creating a local user", async () => {
    const { createLocalUser } = await import("@/lib/admin-user-actions");
    const formData = new FormData();
    formData.set("name", "Новый пользователь");
    formData.set("email", "new.user@example.com");
    formData.set("password", "local-password-123");
    formData.set("role", "QA_ANALYST");

    await createLocalUser(formData);

    expect(mocks.redirect).toHaveBeenCalledWith("/admin/users?section=directory");
  });

  it("blocks demo admins before creating real users", async () => {
    const { createLocalUser } = await import("@/lib/admin-user-actions");
    const formData = new FormData();
    formData.set("name", "Новый пользователь");
    formData.set("email", "new.user@example.com");
    formData.set("password", "local-password-123");
    formData.set("role", "QA_ANALYST");
    mocks.assertCanPersistSettings.mockRejectedValue(new Error("Демо-пользователи не могут сохранять настройки реального окружения."));

    await expect(createLocalUser(formData)).rejects.toThrow("Демо-пользователи не могут сохранять настройки реального окружения.");

    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.prisma.user.create).not.toHaveBeenCalled();
  });

  it("updates an existing user role within the current workspace", async () => {
    const { updateUserAccess } = await import("@/lib/admin-user-actions");
    const formData = new FormData();
    formData.set("userId", "user-2");
    formData.set("role", "TEAM_LEAD");
    formData.set("teamName", "Лиды");
    formData.set("supportLine", "VIP");

    await updateUserAccess(formData);

    expect(mocks.requireCurrentUserPermission).toHaveBeenCalledWith("users:manage");
    expect(mocks.prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: "user-2",
        workspaceId: "workspace-1"
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true
      }
    });
    expect(mocks.prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-2" },
      data: {
        role: "TEAM_LEAD",
        teamName: "Лиды",
        supportLine: "VIP"
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true
      }
    });
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.user_access_updated",
        targetId: "user-2",
        metadata: {
          previousRole: "QA_ANALYST",
          role: "TEAM_LEAD",
          teamName: "Лиды",
          supportLine: "VIP"
        }
      }),
      mocks.prisma
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/users");
  });

  it("does not allow an administrator to remove their own admin role", async () => {
    const { updateUserAccess } = await import("@/lib/admin-user-actions");
    mocks.prisma.user.findFirst.mockResolvedValueOnce({
      id: "admin-1",
      email: "admin@example.com",
      name: "Администратор",
      role: "ADMIN"
    });
    const formData = new FormData();
    formData.set("userId", "admin-1");
    formData.set("role", "QA_ANALYST");

    await expect(updateUserAccess(formData)).rejects.toThrow("Нельзя снять роль администратора с собственной учетной записи.");
    expect(mocks.prisma.user.update).not.toHaveBeenCalled();
  });
});
