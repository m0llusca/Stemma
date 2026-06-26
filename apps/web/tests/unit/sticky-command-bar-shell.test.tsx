import "@testing-library/jest-dom/vitest";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StickyCommandBarShell } from "@/components/reports/sticky-command-bar-shell";

describe("StickyCommandBarShell", () => {
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalCancelAnimationFrame = window.cancelAnimationFrame;
  const originalScrollY = Object.getOwnPropertyDescriptor(window, "scrollY");
  const originalOffsetTop = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetTop");
  const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
  let scrollY = 0;
  let commandBarTop = 240;
  let commandBarHeight = 126;

  beforeEach(() => {
    scrollY = 0;
    commandBarTop = 240;
    commandBarHeight = 126;
    document.documentElement.style.setProperty("--app-topbar-height", "52px");
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      get: () => scrollY
    });
    Object.defineProperty(HTMLElement.prototype, "offsetTop", {
      configurable: true,
      get() {
        return this.classList.contains("report-command-bar") || this.classList.contains("report-command-bar__slot") ? 240 : 0;
      }
    });
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      const isCommandBar = this.classList.contains("report-command-bar");
      const isSlot = this.classList.contains("report-command-bar__slot");
      const isStuck = this.classList.contains("report-command-bar--stuck");
      const top = isCommandBar || isSlot ? commandBarTop : 0;

      return {
        x: 0,
        y: top,
        top,
        right: 0,
        bottom: 0,
        left: 0,
        width: 0,
        height: isCommandBar ? (isStuck ? 54 : commandBarHeight) : 0,
        toJSON: () => ({})
      } as DOMRect;
    };
    window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    window.cancelAnimationFrame = vi.fn();
  });

  afterEach(() => {
    document.documentElement.style.removeProperty("--app-topbar-height");
    if (originalScrollY) {
      Object.defineProperty(window, "scrollY", originalScrollY);
    }
    if (originalOffsetTop) {
      Object.defineProperty(HTMLElement.prototype, "offsetTop", originalOffsetTop);
    }
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
  });

  it("keeps the stuck class stable when sticky styling changes the element rect", () => {
    render(
      <StickyCommandBarShell className="report-command-bar" ariaLabel="Настройки аналитики">
        Панель
      </StickyCommandBarShell>
    );

    const shell = screen.getByLabelText("Настройки аналитики");
    expect(shell).not.toHaveClass("report-command-bar--stuck");

    act(() => {
      scrollY = 190;
      commandBarTop = 50;
      window.dispatchEvent(new Event("scroll"));
    });

    expect(shell).toHaveClass("report-command-bar--stuck");

    act(() => {
      commandBarTop = 55;
      window.dispatchEvent(new Event("scroll"));
    });

    expect(shell).toHaveClass("report-command-bar--stuck");
  });

  it("keeps the original flow height when the compact stuck bar is rendered", () => {
    render(
      <StickyCommandBarShell className="report-command-bar" ariaLabel="Настройки аналитики">
        Панель
      </StickyCommandBarShell>
    );

    const shell = screen.getByLabelText("Настройки аналитики");
    const slot = shell.parentElement;

    expect(slot).toHaveClass("report-command-bar__slot");
    expect(slot).toHaveStyle({ minHeight: "126px" });

    act(() => {
      scrollY = 190;
      commandBarTop = 50;
      window.dispatchEvent(new Event("scroll"));
    });

    expect(shell).toHaveClass("report-command-bar--stuck");
    expect(slot).toHaveStyle({ minHeight: "126px" });
  });

  it("shrinks the reserved flow height after expanded controls collapse", () => {
    commandBarHeight = 360;

    render(
      <StickyCommandBarShell className="report-command-bar" ariaLabel="Настройки аналитики">
        Панель
      </StickyCommandBarShell>
    );

    const shell = screen.getByLabelText("Настройки аналитики");
    const slot = shell.parentElement;

    expect(slot).toHaveStyle({ minHeight: "360px" });

    act(() => {
      commandBarHeight = 126;
      window.dispatchEvent(new Event("scroll"));
    });

    expect(shell).not.toHaveClass("report-command-bar--stuck");
    expect(slot).toHaveStyle({ minHeight: "126px" });
  });
});
