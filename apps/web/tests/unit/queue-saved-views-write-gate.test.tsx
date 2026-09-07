import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueueSavedViews } from "@/components/review/queue-saved-views";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  )
}));

vi.mock("@/lib/queue-view-actions", () => ({
  createSavedQueueView: vi.fn(),
  deleteSavedQueueView: vi.fn()
}));

const savedViews = [
  {
    id: "view-critical",
    name: "Критические за период",
    href: "/reviews?process=critical",
    scope: "workspace"
  }
];

function renderViews(canWriteReviews: boolean) {
  render(
    <QueueSavedViews
      currentAssigneeName="Мария"
      currentHref="/reviews"
      savedViews={savedViews}
      canWriteReviews={canWriteReviews}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: /Быстрые виды/ }));
}

describe("QueueSavedViews write gate", () => {
  it("lets writers create views while still applying chips", () => {
    renderViews(true);

    expect(screen.getByRole("link", { name: "Все" })).toHaveAttribute("href", "/reviews");
    expect(screen.getByRole("link", { name: "Просрочено" })).toHaveAttribute("href", "/reviews?due=overdue");
    expect(screen.getByLabelText("Сохранить текущий вид")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeInTheDocument();
    expect(screen.getByLabelText("Доступ")).toBeInTheDocument();
  });

  it("keeps apply/select for EXEC / SUPPORT_AGENT / VIEWER readers without mutate chrome", () => {
    renderViews(false);

    expect(screen.getByRole("link", { name: "Все" })).toHaveAttribute("href", "/reviews");
    expect(screen.getByRole("link", { name: "Просрочено" })).toHaveAttribute("href", "/reviews?due=overdue");
    expect(screen.queryByLabelText("Сохранить текущий вид")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Сохранить" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Доступ")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Удалить представление/ })).not.toBeInTheDocument();
  });
});
