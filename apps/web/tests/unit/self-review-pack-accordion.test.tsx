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
        <AccordionTrigger aria-label="Разбор: Открытый пак">Открытый пак</AccordionTrigger>
        <AccordionContent>
          <p>Цитата открытого пака про маршрутизацию</p>
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="closed-pack">
        <AccordionTrigger aria-label="Разбор: Закрытый пак">Закрытый пак</AccordionTrigger>
        <AccordionContent>
          <p>Цитата закрытого пака про компенсацию</p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
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
    expect(openTrigger).toHaveAttribute("aria-expanded", "true");
    expect(closedTrigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Цитата открытого пака про маршрутизацию")).toBeVisible();

    act(() => {
      fireEvent.click(closedTrigger);
    });
    expect(closedTrigger).toHaveAttribute("aria-expanded", "true");
    expect(openTrigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Цитата закрытого пака про компенсацию")).toBeVisible();
  });

  it("keeps closed pack copy mounted for find-in-page without opening every pack", () => {
    act(() => {
      render(<PackAccordion />);
    });

    const closedCopy = screen.getByText("Цитата закрытого пака про компенсацию");
    const closedPanel = closedCopy.closest("[hidden]");

    expect(closedPanel).toHaveAttribute("hidden", "until-found");
    expect(screen.getByRole("button", { name: "Разбор: Открытый пак" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(screen.getByRole("button", { name: "Разбор: Закрытый пак" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });
});
