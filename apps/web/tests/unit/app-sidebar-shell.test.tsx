import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppSidebarShell } from "@/components/app-sidebar-shell";
import { buildShellNavigation } from "@/lib/shell/navigation";

const mocks = vi.hoisted(() => ({
  pathname: "/reviews"
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname
}));

describe("app sidebar shell", () => {
  beforeEach(() => {
    mocks.pathname = "/reviews";
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn()
      }
    });
  });

  it("submits logout through a native post form", () => {
    render(<AppSidebarShell navigation={buildShellNavigation({ role: "ADMIN" })} />);

    const logoutButton = screen.getByRole("button", { name: "Выйти" });
    const logoutForm = logoutButton.closest("form");

    expect(logoutForm).not.toBeNull();
    expect(logoutForm?.getAttribute("action")).toBe("/auth/logout");
    expect(logoutForm?.getAttribute("method")).toBe("post");
    expect(screen.queryByRole("link", { name: "Выйти" })).toBeNull();
  });

  it("marks only the most specific matching navigation item as current", () => {
    mocks.pathname = "/admin/localization";

    render(<AppSidebarShell navigation={buildShellNavigation({ role: "ADMIN" })} />);

    expect(screen.getByRole("link", { name: "Сегодня" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("link", { name: "Система" }).getAttribute("aria-current")).toBe("page");
    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });
});
