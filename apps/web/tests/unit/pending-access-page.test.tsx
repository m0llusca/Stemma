import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getDemoRoleSwitcher: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  })
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  )
}));

vi.mock("@/lib/current-user", () => ({
  AuthRequiredError: class AuthRequiredError extends Error {
    constructor() {
      super("Нет активной сессии. Войдите снова, чтобы продолжить.");
      this.name = "AuthRequiredError";
    }
  },
  getCurrentUser: mocks.getCurrentUser
}));

vi.mock("@/lib/auth/demo-switcher", () => ({
  getDemoRoleSwitcher: mocks.getDemoRoleSwitcher,
  demoRoleSwitchFormData: (userId: string) => {
    const formData = new FormData();
    formData.set("userId", userId);
    return formData;
  }
}));

vi.mock("@/lib/user-actions", () => ({
  switchCurrentUser: vi.fn()
}));

describe("pending-access holding state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDemoRoleSwitcher.mockResolvedValue(null);
    mocks.getCurrentUser.mockResolvedValue({
      id: "demo-user-viewer",
      email: "viewer@example.com",
      name: "Гость",
      role: "VIEWER"
    });
  });

  it("shows identity and logout without product chrome for a viewer", async () => {
    const { default: PendingAccessPage } = await import("@/app/auth/pending-access/page");

    render(await PendingAccessPage());

    expect(screen.getByText("Доступ ещё не выдан")).not.toBeNull();
    expect(screen.getByText(/права на продукт пока не назначены/)).not.toBeNull();
    expect(screen.getByText("viewer@example.com")).not.toBeNull();
    expect(screen.getByText("Без доступа")).not.toBeNull();
    const logout = screen.getByRole("button", { name: "Выйти" });
    expect(logout.getAttribute("href")).toBe("/auth/logout");
    expect(screen.queryByRole("navigation", { name: "Основные разделы" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Командная палитра|⌘K|Поиск/i })).toBeNull();
    expect(screen.queryByRole("button", { name: "Сменить роль" })).toBeNull();
  });

  it("shows Сменить роль for a viewer only when demo auth lists seeded users", async () => {
    mocks.getDemoRoleSwitcher.mockResolvedValue({
      currentUserId: "demo-user-viewer",
      roleLabel: "Без доступа",
      users: [
        {
          id: "demo-user-viewer",
          name: "Гость",
          roleLabel: "Без доступа",
          optionLabel: "Гость · Без доступа · Демо"
        },
        {
          id: "demo-analyst",
          name: "Анна QA",
          roleLabel: "Проверяющий",
          optionLabel: "Анна QA · Проверяющий · Демо"
        }
      ]
    });
    const { default: PendingAccessPage } = await import("@/app/auth/pending-access/page");

    render(await PendingAccessPage());

    expect(screen.queryByRole("button", { name: "Сменить роль" })).toBeNull();
    const profile = screen.getByRole("button", { name: /Профиль: Без доступа/ });
    expect(profile).not.toBeNull();
    fireEvent.click(profile);
    expect(screen.getByRole("menuitem", { name: "Анна QA · Проверяющий · Демо" })).not.toBeNull();
    expect(mocks.getDemoRoleSwitcher).toHaveBeenCalledWith(
      expect.objectContaining({ id: "demo-user-viewer", role: "VIEWER" })
    );
  });

  it("sends anonymous visitors to login", async () => {
    const { AuthRequiredError } = await import("@/lib/current-user");
    mocks.getCurrentUser.mockRejectedValue(new AuthRequiredError());
    const { default: PendingAccessPage } = await import("@/app/auth/pending-access/page");

    await expect(PendingAccessPage()).rejects.toThrow(
      "NEXT_REDIRECT:/auth/login?returnTo=/auth/pending-access"
    );
  });

  it("redirects roles with product access to their home", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "user-admin",
      email: "admin@example.com",
      name: "Администратор",
      role: "ADMIN"
    });
    const { default: PendingAccessPage } = await import("@/app/auth/pending-access/page");

    await expect(PendingAccessPage()).rejects.toThrow("NEXT_REDIRECT:/dashboard");
  });
});
