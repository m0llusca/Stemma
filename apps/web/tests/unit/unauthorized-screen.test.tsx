import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UnauthorizedScreen } from "@/components/auth/unauthorized-screen";
import { sessionRequiredMessage } from "@/lib/api/user-facing-errors";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  )
}));

describe("UnauthorizedScreen", () => {
  it("sends an invalid session to login instead of the generic error or 403 copy", () => {
    render(<UnauthorizedScreen />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Нужно войти");
    expect(alert).toHaveTextContent(sessionRequiredMessage);
    expect(screen.queryByText("Что-то пошло не так")).not.toBeInTheDocument();
    expect(screen.queryByText("Недостаточно прав")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Войти" })).toHaveAttribute("href", "/auth/login");
  });

  it("keeps a deep-link returnTo on the login CTA", () => {
    render(<UnauthorizedScreen loginHref="/auth/login?returnTo=%2Freviews%2Fabc" />);
    expect(screen.getByRole("button", { name: "Войти" })).toHaveAttribute(
      "href",
      "/auth/login?returnTo=%2Freviews%2Fabc"
    );
  });
});
