import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion";

function PackAccordion() {
  return (
    <Accordion defaultValue={["open-pack"]} multiple={false} hiddenUntilFound className="gap-3">
      <AccordionItem value="open-pack">
        <AccordionTrigger aria-label="Разбор: Открытый пак">
          <span title="Открытый пак">Открытый пак</span>
        </AccordionTrigger>
        <AccordionContent>
          <p>Цитата открытого пака про маршрутизацию</p>
          <a href="/reviews/open-pack">Открыть</a>
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="closed-pack">
        <AccordionTrigger aria-label="Разбор: Закрытый пак">
          <span title="Закрытый пак">Закрытый пак</span>
        </AccordionTrigger>
        <AccordionContent>
          <p>Цитата закрытого пака про компенсацию</p>
          <a href="/reviews/closed-pack">Открыть</a>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function expandedTriggers() {
  return screen.getAllByRole("button", { name: /Разбор:/ }).filter(
    (button) => button.getAttribute("aria-expanded") === "true"
  );
}

function panelForCopy(text: string) {
  const copy = screen.getByText(text);
  return copy.closest("[data-slot='accordion-content']") as HTMLElement | null;
}

describe("self-review pack accordion a11y", () => {
  it("expands and collapses when the subject is clicked", () => {
    act(() => {
      render(<PackAccordion />);
    });

    const openTrigger = screen.getByRole("button", { name: "Разбор: Открытый пак" });
    const closedTrigger = screen.getByRole("button", { name: "Разбор: Закрытый пак" });

    expect(openTrigger.tagName).toBe("BUTTON");
    expect(openTrigger.closest("a")).toBeNull();
    expect(closedTrigger.closest("a")).toBeNull();
    expect(expandedTriggers()).toHaveLength(1);
    expect(openTrigger).toHaveAttribute("aria-expanded", "true");
    expect(closedTrigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Цитата открытого пака про маршрутизацию")).toBeVisible();

    expect(screen.queryByRole("link", { name: "Открытый пак" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Закрытый пак" })).not.toBeInTheDocument();

    const pathBefore = window.location.pathname;
    act(() => {
      fireEvent.click(screen.getByText("Закрытый пак"));
    });
    expect(expandedTriggers()).toHaveLength(1);
    expect(closedTrigger).toHaveAttribute("aria-expanded", "true");
    expect(openTrigger).toHaveAttribute("aria-expanded", "false");
    expect(panelForCopy("Цитата открытого пака про маршрутизацию")?.offsetHeight).toBe(0);
    expect(window.location.pathname).toBe(pathBefore);
    expect(window.location.pathname).not.toMatch(/\/reviews\//);
    expect(screen.getByText("Цитата закрытого пака про компенсацию")).toBeVisible();
    expect(screen.getByRole("link", { name: "Открыть" })).toHaveAttribute("href", "/reviews/closed-pack");
  });

  it("keeps closed pack copy mounted for find-in-page without opening every pack", () => {
    act(() => {
      render(<PackAccordion />);
    });

    const closedCopy = screen.getByText("Цитата закрытого пака про компенсацию");
    const closedPanel = closedCopy.closest("[hidden]");

    expect(expandedTriggers()).toHaveLength(1);
    expect(closedPanel).toHaveAttribute("hidden", "until-found");
    expect(closedPanel).toHaveAttribute("data-slot", "accordion-content");
    expect((closedPanel as HTMLElement).offsetHeight).toBe(0);
    expect(screen.getByRole("button", { name: "Разбор: Открытый пак" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(screen.getByRole("button", { name: "Разбор: Закрытый пак" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(screen.queryAllByRole("link", { name: "Открыть" })).toHaveLength(1);
  });
});
