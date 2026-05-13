import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HelpTooltip } from "@/components/ui/help-tooltip";

describe("HelpTooltip", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it("closes on document Escape when focus is elsewhere", () => {
    const { container } = render(
      <>
        <button type="button">Другой элемент</button>
        <HelpTooltip label="Документ" content="Текст." />
      </>
    );

    const otherButton = screen.getByRole("button", { name: "Другой элемент" });
    const wrapper = container.querySelector(".help-tooltip");

    act(() => {
      otherButton.focus();
    });
    fireEvent.pointerEnter(wrapper!);
    expect(wrapper).toHaveAttribute("data-open", "true");

    fireEvent.keyDown(document, { key: "Escape" });

    expect(wrapper).toHaveAttribute("data-open", "false");
    expect(document.activeElement).toBe(otherButton);
  });

  it("opens on pointer enter and delays close on pointer leave", () => {
    vi.useFakeTimers();
    const { container } = render(<HelpTooltip label="Наведение" content="Текст." />);

    const wrapper = container.querySelector(".help-tooltip");

    expect(wrapper).toHaveAttribute("data-open", "false");

    fireEvent.pointerEnter(wrapper!);
    expect(wrapper).toHaveAttribute("data-open", "true");

    fireEvent.pointerLeave(wrapper!);
    expect(wrapper).toHaveAttribute("data-open", "true");

    act(() => {
      vi.advanceTimersByTime(119);
    });
    expect(wrapper).toHaveAttribute("data-open", "true");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(wrapper).toHaveAttribute("data-open", "false");
  });

  it("stays open when the pointer reaches tooltip content before delayed close", () => {
    vi.useFakeTimers();
    const { container } = render(<HelpTooltip label="Переход" content="Текст." />);

    const wrapper = container.querySelector(".help-tooltip");
    const tooltip = screen.getByRole("tooltip");

    fireEvent.pointerEnter(wrapper!);
    expect(wrapper).toHaveAttribute("data-open", "true");

    fireEvent.pointerLeave(wrapper!);
    act(() => {
      vi.advanceTimersByTime(60);
    });
    fireEvent.pointerEnter(tooltip);
    act(() => {
      vi.advanceTimersByTime(120);
    });

    expect(wrapper).toHaveAttribute("data-open", "true");
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
