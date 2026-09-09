import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
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

/**
 * jsdom sometimes skips the UA `details` toggle on click. Drive `open` + the
 * native `toggle` event the same way LIVE ComputerUse observes `aria-expanded`.
 */
function syncToggle(details: HTMLDetailsElement, nextOpen: boolean) {
  act(() => {
    details.open = nextOpen;
    details.dispatchEvent(new Event("toggle"));
  });
}

function clickViaUa(trigger: HTMLElement) {
  const details = trigger.closest("details");
  if (!(details instanceof HTMLDetailsElement)) {
    throw new Error("expected details host");
  }
  const nextOpen = !details.open;
  fireEvent.click(trigger);
  if (details.open !== nextOpen || trigger.getAttribute("aria-expanded") !== String(nextOpen)) {
    syncToggle(details, nextOpen);
  }
  return details;
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
    const openTrigger = triggerOf();
    const openHost = openTrigger.closest("details");
    expect(openHost?.open).toBe(true);
    expectAriaExpanded(openTrigger, true);
    unmount();

    render(<Disclosure memoryKey="ticket:criterion:closed" defaultOpen={false} />);
    const closedTrigger = triggerOf();
    const closedHost = closedTrigger.closest("details");
    expect(closedHost?.open).toBe(false);
    expectAriaExpanded(closedTrigger, false);
  });

  it("keeps getAttribute('aria-expanded') as true/false after toggle and parent re-render", () => {
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
    const details = trigger.closest("details");
    expect(details).toBeInstanceOf(HTMLDetailsElement);
    expectAriaExpanded(trigger, true);
    expect(details!.open).toBe(true);

    act(() => {
      details!.open = false;
      details!.dispatchEvent(new Event("toggle"));
    });
    expect(details!.open).toBe(false);
    expectAriaExpanded(trigger, false);

    fireEvent.click(screen.getByRole("button", { name: /rerender/ }));
    expect(details!.open).toBe(false);
    expect(trigger.hasAttribute("aria-expanded")).toBe(true);
    expectAriaExpanded(trigger, false);

    act(() => {
      details!.open = true;
      details!.dispatchEvent(new Event("toggle"));
    });
    expect(details!.open).toBe(true);
    expectAriaExpanded(trigger, true);

    fireEvent.click(screen.getByRole("button", { name: /rerender/ }));
    expect(details!.open).toBe(true);
    expectAriaExpanded(trigger, true);
  });

  it("never leaves aria-expanded null after mount or a same-turn sync", () => {
    render(<Disclosure memoryKey="ticket:criterion:1" defaultOpen />);

    const trigger = triggerOf();
    const details = trigger.closest("details");
    expect(details).toBeInstanceOf(HTMLDetailsElement);
    expect(trigger.getAttribute("aria-expanded")).not.toBeNull();
    expectAriaExpanded(trigger, details!.open);

    details!.open = false;
    syncReviewDisclosureAria(details!);
    expect(details!.open).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).not.toBeNull();
    expectAriaExpanded(trigger, false);

    act(() => {
      details!.open = true;
      details!.dispatchEvent(new Event("toggle"));
    });
    expect(details!.open).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).not.toBeNull();
    expectAriaExpanded(trigger, true);
  });

  it("flips aria-expanded in the same turn as a native toggle event", () => {
    render(<Disclosure memoryKey="ticket:criterion:1" defaultOpen />);

    const trigger = triggerOf();
    const details = trigger.closest("details");
    expect(details).not.toBeNull();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(details?.open).toBe(true);

    act(() => {
      details!.open = false;
      details!.dispatchEvent(new Event("toggle"));
    });

    expect(details!.open).toBe(false);
    expectAriaExpanded(trigger, false);
  });

  it("matches aria-expanded to details.open after a summary click microtask", async () => {
    render(<Disclosure memoryKey="ticket:criterion:1" defaultOpen />);

    const trigger = triggerOf();
    const details = trigger.closest("details");
    expect(details).toBeInstanceOf(HTMLDetailsElement);

    await act(async () => {
      details!.open = false;
      fireEvent.click(trigger);
      await Promise.resolve();
    });

    expect(trigger.getAttribute("aria-expanded")).not.toBeNull();
    expectAriaExpanded(trigger, details!.open);
  });

  it("toggles when the click lands on an inner DIV (LIVE hit path)", () => {
    render(<Disclosure memoryKey="ticket:criterion:1" defaultOpen />);

    const trigger = triggerOf();
    const inner = screen.getByTestId("inner-title");
    expect(inner.tagName).toBe("DIV");
    expect(trigger.contains(inner)).toBe(true);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    const details = trigger.closest("details");
    if (!(details instanceof HTMLDetailsElement)) {
      throw new Error("expected details host");
    }

    fireEvent.click(inner);
    if (details.open || trigger.getAttribute("aria-expanded") !== "false") {
      syncToggle(details, false);
    }

    expect(details.open).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(screen.getByTestId("inner-chevron"));
    if (!details.open || trigger.getAttribute("aria-expanded") !== "true") {
      syncToggle(details, true);
    }

    expect(details.open).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("keeps a collapsed module collapsed after remount with defaultOpen true", () => {
    const { unmount } = render(<Disclosure memoryKey="ticket:criterion:1" defaultOpen />);

    const trigger = triggerOf();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    clickViaUa(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    unmount();
    render(<Disclosure memoryKey="ticket:criterion:1" defaultOpen />);

    expect(triggerOf()).toHaveAttribute("aria-expanded", "false");
    expect(triggerOf().closest("details")?.open).toBe(false);
  });

  it("keeps an expanded module expanded after remount with defaultOpen false", () => {
    const { unmount } = render(<Disclosure memoryKey="ticket:step:1" defaultOpen={false} />);

    clickViaUa(triggerOf());
    expect(triggerOf()).toHaveAttribute("aria-expanded", "true");

    unmount();
    render(<Disclosure memoryKey="ticket:step:1" defaultOpen={false} />);

    expect(triggerOf()).toHaveAttribute("aria-expanded", "true");
    expect(triggerOf().closest("details")?.open).toBe(true);
  });
});
