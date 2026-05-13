import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HelpTooltip } from "@/components/ui/help-tooltip";

describe("HelpTooltip", () => {
  it("links the trigger to tooltip content for assistive technologies", () => {
    render(<HelpTooltip label="Что значит статус?" content="Статус показывает readiness gate." />);

    const trigger = screen.getByRole("button", { name: "Что значит статус?" });
    const tooltip = screen.getByRole("tooltip");

    expect(screen.getByText("Статус показывает readiness gate.")).toBeInTheDocument();
    expect(trigger).toHaveClass("help-tooltip__trigger");
    expect(trigger).toHaveAttribute("aria-describedby", tooltip.id);
  });
});
