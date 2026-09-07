import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NotFoundScreen } from "@/components/auth/not-found-screen";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  )
}));

describe("NotFoundScreen", () => {
  it("sends the user to the supplied role home instead of a dashboard label", () => {
    render(<NotFoundScreen homeHref="/self-review" />);

    expect(screen.getByText("Страница не найдена")).toBeInTheDocument();
    expect(screen.getByText(/вернитесь на главную/i)).toBeInTheDocument();
    expect(screen.queryByText(/дашборд/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "На главную" })).toHaveAttribute("href", "/self-review");
  });
});

describe("not-found route", () => {
  const source = readFileSync(join(process.cwd(), "src/app/not-found.tsx"), "utf8");

  it("resolves the CTA through roleHomePath", () => {
    expect(source).toContain("roleHomePath(user.role, { name: user.name })");
    expect(source).toContain("<NotFoundScreen homeHref={homeHref} />");
    expect(source).not.toContain("На дашборд");
    expect(source).not.toContain('href="/"');
  });
});
