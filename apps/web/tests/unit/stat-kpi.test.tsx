import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatKpi } from "@/components/ui/stat-kpi";

describe("StatKpi", () => {
  it("renders label and value", () => {
    render(<StatKpi label="Ожидают" value={12} />);

    expect(screen.getByText("Ожидают")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("recolors the value and card surface for the danger tone", () => {
    render(<StatKpi label="Просрочено" value={3} tone="danger" />);

    const value = screen.getByText("3");
    expect(value).toHaveClass("text-destructive");
    expect(value.closest('[data-slot="card"]')).toHaveClass("bg-destructive/15");
  });

  it("recolors the value and card surface for the warning tone", () => {
    render(<StatKpi label="Долгие проверки" value={7} tone="warning" />);

    const value = screen.getByText("7");
    expect(value).toHaveClass("text-warning");
    expect(value.closest('[data-slot="card"]')).toHaveClass("bg-warning-soft");
  });

  it("keeps the neutral tone untinted", () => {
    render(<StatKpi label="Ожидают" value={12} tone="neutral" />);

    const value = screen.getByText("12");
    expect(value).not.toHaveClass("text-destructive");
    expect(value).not.toHaveClass("text-warning");
    expect(value).not.toHaveClass("text-muted-foreground");
    expect(value.closest('[data-slot="card"]')).not.toHaveClass("bg-destructive/15");
  });

  it("never leaks a tone marker into the output", () => {
    const { container } = render(<StatKpi label="Просрочено" value={3} tone="danger" />);

    expect(container.textContent).not.toContain("tone:");
    expect(screen.queryByText(/tone:/)).not.toBeInTheDocument();
  });

  it("exposes the value as plain text, not a document heading", () => {
    render(<StatKpi label="Ожидают" value={12} />);

    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});
