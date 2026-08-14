import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EvidenceJumpLink } from "@/components/review/evidence-jump-link";

function setReducedMotion(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    })
  );
}

describe("EvidenceJumpLink motion and timer safety", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("PointerEvent", MouseEvent);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each([
    [true, "auto"],
    [false, "smooth"]
  ] as const)(
    "uses %s reduced-motion preference to select %s scrolling",
    (reduced, behavior) => {
      setReducedMotion(reduced);
      const target = document.createElement("article");
      target.id = "msg-42";
      target.scrollIntoView = vi.fn();
      document.body.appendChild(target);
      render(<EvidenceJumpLink messageId="42" timeLabel="12:30" />);

      fireEvent.click(screen.getByRole("link"));

      expect(target.scrollIntoView).toHaveBeenCalledWith({
        behavior,
        block: "center"
      });
      expect(target).toHaveClass("conversation-message--evidence-flash");
    }
  );

  it("replaces rapid highlight timers and clears the final timer on unmount", () => {
    setReducedMotion(false);
    const target = document.createElement("article");
    target.id = "msg-42";
    target.scrollIntoView = vi.fn();
    document.body.appendChild(target);
    const { unmount } = render(
      <EvidenceJumpLink messageId="42" timeLabel="12:30" />
    );
    const link = screen.getByRole("link");

    act(() => {
      fireEvent.click(link);
      fireEvent.click(link);
    });

    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
