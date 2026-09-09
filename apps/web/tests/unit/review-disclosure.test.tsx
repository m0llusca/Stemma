import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  commandReviewDisclosure,
  resetReviewDisclosureMemory,
  ReviewDisclosure,
  syncReviewDisclosureAria
} from "@/components/review/review-disclosure";

function Disclosure({ memoryKey, defaultOpen }: { memoryKey: string; defaultOpen: boolean }) {
  return (
    <ReviewDisclosure
      memoryKey={memoryKey}
      defaultOpen={defaultOpen}
      trigger={
        <>
          <div data-testid="inner-title">Точность ответа</div>
          <span data-testid="inner-chevron" aria-hidden="true">
            v
          </span>
        </>
      }
    >
      панель
    </ReviewDisclosure>
  );
}

function triggerOf() {
  return screen.getByRole("button", { name: /Точность ответа/ });
}

function expectAriaExpanded(trigger: HTMLElement, open: boolean) {
  const value = trigger.getAttribute("aria-expanded");
  expect(value).not.toBeNull();
  expect(value).toBe(open ? "true" : "false");
}

function expectOpenAndAria(trigger: HTMLElement, open: boolean) {
  const details = trigger.closest("details");
  expect(details).toBeInstanceOf(HTMLDetailsElement);
  expect(details!.open).toBe(open);
  expectAriaExpanded(trigger, open);
}

describe("ReviewDisclosure native details", () => {
  beforeEach(() => {
    resetReviewDisclosureMemory();
  });

  it("renders a summary trigger, not a Base UI collapsible button", () => {
    render(<Disclosure memoryKey="ticket:criterion:1" defaultOpen />);

    const trigger = triggerOf();
    expect(trigger.tagName).toBe("SUMMARY");
    expect(trigger).toHaveAttribute("data-slot", "review-disclosure-trigger");
    expect(trigger.closest("details")).not.toBeNull();
    expect(trigger.closest("[data-slot=collapsible]")).toBeNull();
    expect(trigger.closest("[data-slot=collapsible-trigger]")).toBeNull();
  });

  it("matches aria-expanded to details.open on first paint", () => {
    const { unmount } = render(<Disclosure memoryKey="ticket:criterion:open" defaultOpen />);
    expectOpenAndAria(triggerOf(), true);
    unmount();

    render(<Disclosure memoryKey="ticket:criterion:closed" defaultOpen={false} />);
    expectOpenAndAria(triggerOf(), false);
  });

  it("opens a closed module and keeps aria-expanded true (LIVE 39be8da)", () => {
    function Harness() {
      const [tick, setTick] = useState(0);
      return (
        <div>
          <button type="button" onClick={() => setTick((value) => value + 1)}>
            rerender {tick}
          </button>
          <Disclosure memoryKey="ticket:criterion:open-from-closed" defaultOpen={false} />
        </div>
      );
    }

    render(<Harness />);
    const trigger = triggerOf();
    expectOpenAndAria(trigger, false);

    fireEvent.click(trigger);
    expectOpenAndAria(trigger, true);

    fireEvent.click(screen.getByRole("button", { name: /rerender/ }));
    expectOpenAndAria(triggerOf(), true);
  });

  it("Enter on a closed trigger opens and persists across a parent re-render", () => {
    function Harness() {
      const [tick, setTick] = useState(0);
      return (
        <div>
          <button type="button" onClick={() => setTick((value) => value + 1)}>
            rerender {tick}
          </button>
          <Disclosure memoryKey="ticket:criterion:enter-open" defaultOpen={false} />
        </div>
      );
    }

    render(<Harness />);
    const trigger = triggerOf();
    expectOpenAndAria(trigger, false);

    fireEvent.keyDown(trigger, { key: "Enter" });
    expectOpenAndAria(trigger, true);

    fireEvent.click(screen.getByRole("button", { name: /rerender/ }));
    expectOpenAndAria(triggerOf(), true);
  });

  it("keeps getAttribute('aria-expanded') as true/false after click and parent re-render", () => {
    function Harness() {
      const [tick, setTick] = useState(0);
      return (
        <div>
          <button type="button" onClick={() => setTick((value) => value + 1)}>
            rerender {tick}
          </button>
          <Disclosure memoryKey="ticket:criterion:rerender" defaultOpen />
        </div>
      );
    }

    render(<Harness />);
    const trigger = triggerOf();
    expectOpenAndAria(trigger, true);

    fireEvent.click(trigger);
    expectOpenAndAria(trigger, false);

    fireEvent.click(screen.getByRole("button", { name: /rerender/ }));
    expect(trigger.hasAttribute("aria-expanded")).toBe(true);
    expectOpenAndAria(trigger, false);

    fireEvent.click(trigger);
    expectOpenAndAria(trigger, true);

    fireEvent.click(screen.getByRole("button", { name: /rerender/ }));
    expectOpenAndAria(trigger, true);
  });

  it("never leaves aria-expanded null after mount or a same-turn sync", () => {
    render(<Disclosure memoryKey="ticket:criterion:1" defaultOpen />);

    const trigger = triggerOf();
    const details = trigger.closest("details");
    expect(details).toBeInstanceOf(HTMLDetailsElement);
    expect(trigger.getAttribute("aria-expanded")).not.toBeNull();
    expectAriaExpanded(trigger, details!.open);

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).not.toBeNull();
    expectOpenAndAria(trigger, false);

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).not.toBeNull();
    expectOpenAndAria(trigger, true);
  });

  it("does not leave aria-expanded true while details is closed when defaultOpen is true", () => {
    const { rerender } = render(<Disclosure memoryKey="ticket:criterion:live-closed" defaultOpen />);

    expectOpenAndAria(triggerOf(), true);

    fireEvent.click(triggerOf());
    expectOpenAndAria(triggerOf(), false);

    rerender(<Disclosure memoryKey="ticket:criterion:live-closed" defaultOpen />);
    expectOpenAndAria(triggerOf(), false);
  });

  it("toggles when the click lands on an inner DIV (LIVE hit path)", () => {
    render(<Disclosure memoryKey="ticket:criterion:1" defaultOpen />);

    const trigger = triggerOf();
    const inner = screen.getByTestId("inner-title");
    expect(inner.tagName).toBe("DIV");
    expect(trigger.contains(inner)).toBe(true);
    expectOpenAndAria(trigger, true);

    fireEvent.click(inner);
    expectOpenAndAria(trigger, false);

    fireEvent.click(screen.getByTestId("inner-chevron"));
    expectOpenAndAria(trigger, true);
  });

  it("keeps a collapsed module collapsed after remount with defaultOpen true", () => {
    const { unmount } = render(<Disclosure memoryKey="ticket:criterion:1" defaultOpen />);

    fireEvent.click(triggerOf());
    expectOpenAndAria(triggerOf(), false);

    unmount();
    render(<Disclosure memoryKey="ticket:criterion:1" defaultOpen />);

    expectOpenAndAria(triggerOf(), false);
  });

  it("keeps an expanded module expanded after remount with defaultOpen false", () => {
    const { unmount } = render(<Disclosure memoryKey="ticket:step:1" defaultOpen={false} />);

    fireEvent.click(triggerOf());
    expectOpenAndAria(triggerOf(), true);

    unmount();
    render(<Disclosure memoryKey="ticket:step:1" defaultOpen={false} />);

    expectOpenAndAria(triggerOf(), true);
  });

  it("commandReviewDisclosure toggles without reading details.open", () => {
    render(<Disclosure memoryKey="ticket:criterion:command" defaultOpen={false} />);
    const trigger = triggerOf();
    const details = trigger.closest("details");
    expect(details).toBeInstanceOf(HTMLDetailsElement);

    act(() => {
      commandReviewDisclosure(details!);
    });
    expectOpenAndAria(trigger, true);

    act(() => {
      commandReviewDisclosure(details!, false);
    });
    expectOpenAndAria(trigger, false);
    syncReviewDisclosureAria(details!, false);
    expectAriaExpanded(trigger, false);
  });
});
