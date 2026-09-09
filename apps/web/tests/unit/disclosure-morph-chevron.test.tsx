import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  DisclosureMorphChevron,
  DisclosureOpenProvider
} from "@/components/ui/disclosure-morph-chevron";
import {
  resetReviewDisclosureMemory,
  ReviewDisclosure
} from "@/components/review/review-disclosure";

function morphIconMarkup() {
  return document.querySelector('[data-slot="morph-icon"]')?.innerHTML ?? "";
}

function expectChevron(direction: "up" | "down") {
  const markup = morphIconMarkup();
  // Morphicons lowers Lucide nodes to cubics; Up starts at (18,15), Down at (6,9).
  if (direction === "up") {
    expect(markup).toMatch(/d="M18 15/);
    expect(markup).not.toMatch(/d="M6 9/);
    return;
  }
  expect(markup).toMatch(/d="M6 9/);
  expect(markup).not.toMatch(/d="M18 15/);
}

describe("DisclosureMorphChevron", () => {
  it("morphs from the explicit open prop", () => {
    const { rerender } = render(
      <button type="button" aria-expanded="false">
        Section
        <DisclosureMorphChevron open={false} />
      </button>
    );
    expect(document.querySelector('[data-slot="disclosure-morph-chevron"]')).not.toBeNull();
    expectChevron("down");

    rerender(
      <button type="button" aria-expanded="true">
        Section
        <DisclosureMorphChevron open />
      </button>
    );
    expect(document.querySelector("[data-slot=disclosure-morph-chevron]")).toHaveAttribute(
      "data-disclosure-open",
      "true"
    );
  });

  it("seeds ChevronUp from details.open on first paint without a Down mount", () => {
    render(
      <details open data-review-disclosure-key="seed-open" data-review-open="true">
        <summary data-slot="review-disclosure-trigger" aria-expanded="true">
          Open module
          <DisclosureMorphChevron />
        </summary>
        <div>body</div>
      </details>
    );
    const host = document.querySelector("[data-slot=disclosure-morph-chevron]");
    expect(host).toHaveAttribute("data-disclosure-open", "true");
    expectChevron("up");
  });

  it("seeds from ReviewDisclosure expanded SoT on a default-open module", () => {
    resetReviewDisclosureMemory();
    render(
      <ReviewDisclosure
        memoryKey="seed-review-open"
        defaultOpen
        trigger={
          <>
            Criterion
            <DisclosureMorphChevron />
          </>
        }
      >
        panel
      </ReviewDisclosure>
    );
    expect(screen.getByRole("button", { name: "Criterion" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expectChevron("up");
  });

  it("uses the disclosure context as first-paint SoT", () => {
    render(
      <DisclosureOpenProvider open>
        <button type="button" aria-expanded="true">
          Context open
          <DisclosureMorphChevron />
        </button>
      </DisclosureOpenProvider>
    );
    expectChevron("up");
  });

  it("observes aria-expanded on the closest trigger after the first seed", async () => {
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
    expect(trigger.querySelector('[data-slot="disclosure-morph-chevron"]')).toHaveAttribute(
      "data-disclosure-open",
      "false"
    );
    expectChevron("down");
    act(() => {
      fireEvent.click(trigger);
    });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    await waitFor(() => {
      expect(trigger.querySelector("[data-slot=disclosure-morph-chevron]")).toHaveAttribute(
        "data-disclosure-open",
        "true"
      );
    });
  });
});
