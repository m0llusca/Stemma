import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppNavFallback } from "@/components/app-nav-fallback";

const mocks = vi.hoisted(() => ({
  pathname: "/dashboard"
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname
}));

describe("app nav fallback", () => {
  beforeEach(() => {
    mocks.pathname = "/dashboard";
  });

  it("renders no header placeholder on auth entry routes", () => {
    mocks.pathname = "/auth/login";
    const { container } = render(<AppNavFallback />);

    expect(container.firstChild).toBeNull();
    expect(screen.queryByLabelText("Глобальная навигация")).toBeNull();
    expect(document.querySelector('[data-slot="app-nav"]')).toBeNull();
  });

  it("keeps the header-height placeholder on product routes", () => {
    render(<AppNavFallback />);

    const header = screen.getByLabelText("Глобальная навигация");
    expect(header.getAttribute("data-slot")).toBe("app-nav");
    expect(header.getAttribute("aria-busy")).toBe("true");
  });
});
