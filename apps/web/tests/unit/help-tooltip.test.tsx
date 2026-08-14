import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { TooltipProvider } from "@/components/ui/tooltip";

function renderHelp(ui: ReactElement) {
  return render(<TooltipProvider delay={0}>{ui}</TooltipProvider>);
}

async function openViaFocus(label: string) {
  const trigger = screen.getByRole("button", { name: label });
  await act(async () => {
    trigger.focus();
  });
  fireEvent.focus(trigger);
  await waitFor(() => {
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });
  return trigger;
}

describe("HelpTooltip", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders an accessible help trigger", () => {
    renderHelp(<HelpTooltip label="Что значит статус?" content="Статус показывает readiness gate." />);

    const trigger = screen.getByRole("button", { name: "Что значит статус?" });
    expect(trigger).toHaveAttribute("data-slot", "tooltip-trigger");
    expect(trigger).toHaveAttribute("data-base-ui-tooltip-trigger");
    expect(trigger.querySelector("svg")).toBeTruthy();
  });

  it("opens on focus and shows tooltip content", async () => {
    renderHelp(<HelpTooltip label="Что значит статус?" content="Статус показывает readiness gate." />);

    await openViaFocus("Что значит статус?");

    expect(screen.getByRole("tooltip")).toHaveTextContent("Статус показывает readiness gate.");
    expect(screen.getByRole("button", { name: "Что значит статус?" })).toHaveAttribute(
      "data-popup-open"
    );
  });

  it("creates independent triggers for multiple instances", () => {
    renderHelp(
      <>
        <HelpTooltip label="Первый статус" content="Первый tooltip." />
        <HelpTooltip label="Второй статус" content="Второй tooltip." />
      </>
    );

    const firstTrigger = screen.getByRole("button", { name: "Первый статус" });
    const secondTrigger = screen.getByRole("button", { name: "Второй статус" });

    expect(firstTrigger.id).toBeTruthy();
    expect(secondTrigger.id).toBeTruthy();
    expect(firstTrigger.id).not.toBe(secondTrigger.id);
  });

  it("applies custom className to the trigger button", () => {
    renderHelp(<HelpTooltip label="Подсказка" content="Текст." className="admin-help" />);

    expect(screen.getByRole("button", { name: "Подсказка" })).toHaveClass("admin-help");
  });

  it("closes on Escape while keeping focus on the trigger", async () => {
    renderHelp(<HelpTooltip label="Закрыть" content="Текст." />);

    const trigger = await openViaFocus("Закрыть");

    fireEvent.keyDown(trigger, { key: "Escape" });
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });
    expect(document.activeElement).toBe(trigger);
  });

  it("opens on pointer enter", async () => {
    renderHelp(<HelpTooltip label="Наведение" content="Текст." />);

    const trigger = screen.getByRole("button", { name: "Наведение" });

    fireEvent.pointerEnter(trigger);
    fireEvent.mouseEnter(trigger);
    fireEvent.pointerMove(trigger);

    await waitFor(() => {
      expect(screen.getByRole("tooltip")).toHaveTextContent("Текст.");
    });
  });

  it("sets an inspectable placement attribute and aligns content", async () => {
    renderHelp(<HelpTooltip label="Положение" content="Текст." placement="top-start" />);

    const trigger = screen.getByRole("button", { name: "Положение" });
    expect(trigger).toHaveAttribute("data-placement", "top-start");

    await openViaFocus("Положение");

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveAttribute("data-side", "top");
    expect(tooltip).toHaveAttribute("data-align", "start");
  });

  it("renders the tooltip layer outside clipped ancestors via base-ui portal", async () => {
    const { container } = renderHelp(
      <div className="clipped-parent" style={{ overflow: "hidden" }}>
        <HelpTooltip label="За пределами панели" content="Текст не должен обрезаться родителем." />
      </div>
    );

    await openViaFocus("За пределами панели");

    const tooltip = screen.getByRole("tooltip");
    expect(within(container.querySelector(".clipped-parent")!).queryByRole("tooltip")).toBeNull();
    expect(tooltip.closest("[data-base-ui-portal]")).toBeTruthy();
    expect(container.querySelector(".clipped-parent")?.contains(tooltip)).toBe(false);
  });

  it("renders block markup inside tooltip content", async () => {
    renderHelp(<HelpTooltip label="Разметка" content={<p>Блочный контент.</p>} />);

    await openViaFocus("Разметка");

    const tooltip = screen.getByRole("tooltip");
    const paragraph = screen.getByText("Блочный контент.");

    expect(tooltip.tagName).toBe("DIV");
    expect(paragraph.tagName).toBe("P");
    expect(tooltip.contains(paragraph)).toBe(true);
  });
});
