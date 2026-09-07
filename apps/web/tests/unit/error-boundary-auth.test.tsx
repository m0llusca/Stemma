import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GlobalError from "@/app/error";
import { sessionRequiredMessage } from "@/lib/api/user-facing-errors";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  )
}));

describe("global error boundary", () => {
  it("maps a serialized AuthRequiredError to the login path", () => {
    const error = new Error(sessionRequiredMessage);
    error.name = "AuthRequiredError";

    render(<GlobalError error={error} reset={() => undefined} />);

    expect(screen.getByText("Нужно войти")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Войти" })).toHaveAttribute("href", "/auth/login");
    expect(screen.queryByText("Что-то пошло не так")).not.toBeInTheDocument();
    expect(screen.queryByText("Недостаточно прав")).not.toBeInTheDocument();
  });

  it("keeps unrelated failures on the generic recovery screen", () => {
    render(<GlobalError error={new Error("database password leaked")} reset={() => undefined} />);

    expect(screen.getByText("Что-то пошло не так")).toBeInTheDocument();
    expect(screen.queryByText("Нужно войти")).not.toBeInTheDocument();
  });
});
