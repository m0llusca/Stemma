import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DisclosureMorphChevron } from "@/components/ui/disclosure-morph-chevron";

describe("DisclosureMorphChevron", () => {
  it("morphs from the explicit open prop", () => {
    const { rerender } = render(
      <button type="button" aria-expanded="false">
        Section
        <DisclosureMorphChevron open={false} />
      </button>
    );
    expect(document.querySelector('[data-slot="disclosure-morph-chevron"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="morph-icon"]')).not.toBeNull();

    rerender(
      <button type="button" aria-expanded="true">
        Section
        <DisclosureMorphChevron open />
      </button>
    );
    expect(document.querySelector('[data-slot="morph-icon"]')).not.toBeNull();
  });

  it("observes aria-expanded on the closest trigger", () => {
    function Harness() {
      return (
        <button
          type="button"
          data-slot="collapsible-trigger"
          aria-expanded="false"
          onClick={(event) => {
            const next = event.currentTarget.getAttribute("aria-expanded") !== "true";
            event.currentTarget.setAttribute("aria-expanded", next ? "true" : "false");
          }}
        >
          Modules
          <DisclosureMorphChevron />
        </button>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Modules" });
    expect(trigger.querySelector('[data-slot="disclosure-morph-chevron"]')).not.toBeNull();
    act(() => {
      fireEvent.click(trigger);
    });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.querySelector('[data-slot="morph-icon"]')).not.toBeNull();
  });
});
