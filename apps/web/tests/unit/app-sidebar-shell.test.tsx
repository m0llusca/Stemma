import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppSidebarShell } from "@/components/app-sidebar-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/reviews"
}));

describe("app sidebar shell", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn()
      }
    });
  });

  it("submits logout through a native post form", () => {
    render(
      <AppSidebarShell items={[{ href: "/reviews", label: "Проверки", icon: "reviews" }]}>
        <span>Роль</span>
      </AppSidebarShell>
    );

    const logoutButton = screen.getByRole("button", { name: "Выйти" });
    const logoutForm = logoutButton.closest("form");

    expect(logoutForm).not.toBeNull();
    expect(logoutForm?.getAttribute("action")).toBe("/auth/logout");
    expect(logoutForm?.getAttribute("method")).toBe("post");
    expect(screen.queryByRole("link", { name: "Выйти" })).toBeNull();
  });
});
