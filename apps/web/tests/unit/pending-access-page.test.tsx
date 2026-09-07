import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
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

describe("pending-access holding state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(screen.getByRole("link", { name: "Выйти" }).getAttribute("href")).toBe("/auth/logout");
    expect(screen.queryByRole("navigation", { name: "Основные разделы" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Командная палитра|⌘K|Поиск/i })).toBeNull();
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
