import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CopyButton } from "@/components/copy-button";

describe("CopyButton motion and timer safety", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("PointerEvent", MouseEvent);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) }
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps static copied feedback in reduced motion", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      })
    );
    const { unmount } = render(<CopyButton value="evidence" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Скопировать" }));
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: "Скопировано" })).toHaveAttribute(
      "data-qc-motion",
      "feedback"
    );
    unmount();
  });

  it("replaces rapid reset timers and clears the final timer on unmount", async () => {
    const { unmount } = render(<CopyButton value="evidence" />);
    const button = screen.getByRole("button", { name: "Скопировать" });

    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
      fireEvent.click(button);
      await Promise.resolve();
    });

    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not create a reset timer when clipboard work resolves after unmount", async () => {
    let resolveClipboard!: () => void;
    const clipboardPromise = new Promise<void>((resolve) => {
      resolveClipboard = resolve;
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(() => clipboardPromise) }
    });
    const { unmount } = render(<CopyButton value="evidence" />);

    fireEvent.click(screen.getByRole("button", { name: "Скопировать" }));
    unmount();
    await act(async () => {
      resolveClipboard();
      await clipboardPromise;
    });

    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps copied feedback enabled after StrictMode replays the mount effect", async () => {
    const { unmount } = render(
      <StrictMode>
        <CopyButton value="evidence" />
      </StrictMode>
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Скопировать" }));
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: "Скопировано" })).toHaveAttribute(
      "data-state",
      "success"
    );
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
