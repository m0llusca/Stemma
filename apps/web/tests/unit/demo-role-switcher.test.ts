import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoLoginUsersFindManyArgs } from "@/lib/auth/demo-users";

const mocks = vi.hoisted(() => ({
  isDemoAuthEnabled: vi.fn(),
  prisma: {
    user: {
      findMany: vi.fn()
    }
  }
}));

vi.mock("@/lib/auth/demo", () => ({
  isDemoAuthEnabled: mocks.isDemoAuthEnabled
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

describe("demo role switcher gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isDemoAuthEnabled.mockReturnValue(false);
    mocks.prisma.user.findMany.mockResolvedValue([]);
  });

  it("returns null and does not query users when demo auth is off", async () => {
    const { getDemoRoleSwitcher } = await import("@/lib/auth/demo-switcher");

    await expect(getDemoRoleSwitcher({ id: "user-1", role: "ADMIN" })).resolves.toBeNull();
    expect(mocks.prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("lists the same seeded demo identities as login when demo auth is enabled", async () => {
    mocks.isDemoAuthEnabled.mockReturnValue(true);
    mocks.prisma.user.findMany.mockResolvedValue([
      {
        id: "demo-admin",
        name: "Админ",
        email: "admin@example.com",
        role: "ADMIN",
        workspace: { name: "Демо" }
      },
      {
        id: "demo-analyst",
        name: "Анна QA",
        email: "qa@example.com",
        role: "QA_ANALYST",
        workspace: { name: "Демо" }
      }
    ]);
    const { getDemoRoleSwitcher } = await import("@/lib/auth/demo-switcher");

    await expect(getDemoRoleSwitcher({ id: "demo-admin", role: "ADMIN" })).resolves.toEqual({
      currentUserId: "demo-admin",
      roleLabel: "Администратор",
      users: [
        {
          id: "demo-admin",
          name: "Админ",
          roleLabel: "Администратор",
          optionLabel: "Админ · Администратор · Демо"
        },
        {
          id: "demo-analyst",
          name: "Анна QA",
          roleLabel: "Проверяющий",
          optionLabel: "Анна QA · Проверяющий · Демо"
        }
      ]
    });
    expect(mocks.prisma.user.findMany).toHaveBeenCalledWith(demoLoginUsersFindManyArgs());
  });

  it("returns null when demo auth is on but no seeded demo users exist", async () => {
    mocks.isDemoAuthEnabled.mockReturnValue(true);
    const { getDemoRoleSwitcher } = await import("@/lib/auth/demo-switcher");

    await expect(getDemoRoleSwitcher({ id: "user-1", role: "ADMIN" })).resolves.toBeNull();
  });
});

describe("demo role switch form", () => {
  it("posts only the selected demo user id", async () => {
    const { demoRoleSwitchFormData } = await import("@/lib/auth/demo-switcher");
    const formData = demoRoleSwitchFormData("demo-analyst");

    expect(formData.get("userId")).toBe("demo-analyst");
    expect(formData.get("returnTo")).toBeNull();
  });
});
