import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HelpTooltip } from "@/components/ui/help-tooltip";

describe("HelpTooltip", () => {
  it("links the trigger to tooltip content", () => {
    render(<HelpTooltip label="Что значит статус?" content="Статус показывает readiness gate." />);

    const trigger = screen.getByRole("button", { name: "Что значит статус?" });
    const tooltip = screen.getByRole("tooltip");

    expect(screen.getByText("Статус показывает readiness gate.")).toBeInTheDocument();
    expect(trigger).toHaveClass("help-tooltip__trigger");
    expect(trigger).toHaveAttribute("aria-describedby", tooltip.id);
  });

  it("creates unique tooltip ids for multiple instances", () => {
    render(
      <>
        <HelpTooltip label="Первый статус" content="Первый tooltip." />
        <HelpTooltip label="Второй статус" content="Второй tooltip." />
      </>
    );

    const firstTrigger = screen.getByRole("button", { name: "Первый статус" });
    const secondTrigger = screen.getByRole("button", { name: "Второй статус" });
    const firstId = firstTrigger.getAttribute("aria-describedby");
    const secondId = secondTrigger.getAttribute("aria-describedby");

    expect(firstId).toBeTruthy();
    expect(secondId).toBeTruthy();
    expect(firstId).not.toBe(secondId);
  });

  it("applies custom className to the wrapper", () => {
    const { container } = render(<HelpTooltip label="Подсказка" content="Текст." className="admin-help" />);

    expect(container.querySelector(".help-tooltip")).toHaveClass("admin-help");
  });

  it("opens on trigger focus", () => {
    const { container } = render(<HelpTooltip label="Фокус" content="Текст." />);

    const trigger = screen.getByRole("button", { name: "Фокус" });
    const wrapper = container.querySelector(".help-tooltip");

    expect(wrapper).toHaveAttribute("data-open", "false");

    fireEvent.focus(trigger);

    expect(wrapper).toHaveAttribute("data-open", "true");
  });

  it("closes on Escape while keeping focus on the trigger", () => {
    const { container } = render(<HelpTooltip label="Закрыть" content="Текст." />);

    const trigger = screen.getByRole("button", { name: "Закрыть" });
    const wrapper = container.querySelector(".help-tooltip");

    act(() => {
      trigger.focus();
    });
    expect(wrapper).toHaveAttribute("data-open", "true");

    fireEvent.keyDown(trigger, { key: "Escape" });

    expect(wrapper).toHaveAttribute("data-open", "false");
    expect(document.activeElement).toBe(trigger);
  });

  it("opens on mouse enter and closes on mouse leave", () => {
    const { container } = render(<HelpTooltip label="Наведение" content="Текст." />);

    const wrapper = container.querySelector(".help-tooltip");

    fireEvent.mouseEnter(wrapper!);
    expect(wrapper).toHaveAttribute("data-open", "true");

    fireEvent.mouseLeave(wrapper!);
    expect(wrapper).toHaveAttribute("data-open", "false");
  });

  it("sets an inspectable placement attribute", () => {
    const { container } = render(
      <HelpTooltip label="Положение" content="Текст." placement="top-start" />
    );

    expect(container.querySelector(".help-tooltip")).toHaveAttribute("data-placement", "top-start");
  });

  it("renders block markup inside tooltip content", () => {
    render(<HelpTooltip label="Разметка" content={<p>Блочный контент.</p>} />);

    const tooltip = screen.getByRole("tooltip");
    const paragraph = screen.getByText("Блочный контент.");

    expect(tooltip.tagName).toBe("DIV");
    expect(paragraph.tagName).toBe("P");
    expect(paragraph.parentElement).toBe(tooltip);
  });
});
