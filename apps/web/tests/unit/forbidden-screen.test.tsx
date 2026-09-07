import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ForbiddenScreen } from "@/components/auth/forbidden-screen";
import { permissionDeniedMessage } from "@/lib/api/user-facing-errors";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  )
}));

describe("ForbiddenScreen", () => {
  it("shows an explicit permission alert instead of the generic error boundary copy", () => {
    render(<ForbiddenScreen homeHref="/self-review" />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Недостаточно прав");
    expect(alert).toHaveTextContent(permissionDeniedMessage);
    expect(screen.queryByText("Что-то пошло не так")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Вернуться" })).toHaveAttribute("href", "/self-review");
  });
});
