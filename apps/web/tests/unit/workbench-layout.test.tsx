import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkbenchLayout } from "@/components/review/workbench-layout";
import { WorkbenchPaneToggle } from "@/components/review/workbench-pane-toggle";
import { EvidenceJumpLink } from "@/components/review/evidence-jump-link";
import { ReviewKeyboard } from "@/components/review/review-keyboard";

const storageKey = "stemma:review-workbench:layout";

function content() {
  return (
    <div id="review-workspace" data-active-pane="dialog">
      <WorkbenchPaneToggle targetId="review-workspace" />
      <WorkbenchLayout
        dialog={<article id="msg-42" tabIndex={-1}>Сообщение клиента</article>}
        score={<form className="review-panel-form"><div data-criterion-card><input aria-label="Черновик" name="comment" /><EvidenceJumpLink messageId="42" timeLabel="12:30" /></div></form>}
      />
    </div>
  );
}

describe("review workbench layout", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();

  });

  it("renders the same server shell without reading browser layout preferences", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const html = renderToString(content());
    expect(getItem).not.toHaveBeenCalled();
    expect(html).toContain('id="msg-42"');
    expect(html).toContain('name="comment"');
    getItem.mockRestore();
  });

  it("retains one transcript and one draft form across mobile pane switches", () => {
    const { container } = render(content());
    const input = screen.getByRole("textbox", { name: "Черновик" });
    fireEvent.change(input, { target: { value: "Сохранённый ввод" } });
    fireEvent.click(screen.getByRole("button", { name: "Оценка" }));
    expect(document.getElementById("review-workspace")).toHaveAttribute("data-active-pane", "score");
    fireEvent.click(screen.getByRole("button", { name: "Диалог" }));
    expect(input).toHaveValue("Сохранённый ввод");
    expect(container.querySelectorAll("form")).toHaveLength(1);
    expect(container.querySelectorAll("#msg-42")).toHaveLength(1);
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it("keeps evidence targets inside their scroll viewport", () => {
    render(content());
    const target = document.getElementById("msg-42")!;
    target.scrollIntoView = vi.fn();
    fireEvent.click(screen.getByRole("link", { name: /Перейти к сообщению-доказательству/ }));
    expect(target.closest('[data-slot="scroll-area-viewport"]')).not.toBeNull();
    expect(target.scrollIntoView).toHaveBeenCalled();
    expect(target).toHaveAttribute("data-evidence-flash");
  });

  it("switches to the dialog and synchronizes mobile controls when jumping to evidence", async () => {
    render(content());
    const target = document.getElementById("msg-42")!;
    target.scrollIntoView = vi.fn();
    fireEvent.click(screen.getByRole("button", { name: "Оценка" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("link", { name: /Перейти к сообщению-доказательству/ }));
    });
    expect(document.getElementById("review-workspace")).toHaveAttribute("data-active-pane", "dialog");
    expect(screen.getByRole("button", { name: "Диалог" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Оценка" })).toHaveAttribute("aria-pressed", "false");
    expect(document.activeElement).toBe(target);
  });

  it("allows native Enter activation of evidence links while review hotkeys are mounted", async () => {
    render(content());
    render(<ReviewKeyboard />);
    const target = document.getElementById("msg-42")!;
    target.scrollIntoView = vi.fn();
    fireEvent.click(screen.getByRole("button", { name: "Оценка" }));
    const link = screen.getByRole("link", { name: /Перейти к сообщению-доказательству/ });
    const criterion = link.closest<HTMLElement>("[data-criterion-card]")!;
    criterion.scrollIntoView = vi.fn();
    link.focus();
    expect(link).toHaveFocus();
    expect(fireEvent.keyDown(link, { key: "Enter" })).toBe(true);
    expect(criterion.scrollIntoView).not.toHaveBeenCalled();
    // jsdom does not generate the browser's native anchor click after keydown.
    await act(async () => { fireEvent.click(link); });
    expect(document.getElementById("review-workspace")).toHaveAttribute("data-active-pane", "dialog");
    expect(target).toHaveFocus();
  });

  it.each(["{broken", '{"review-dialog":-10,"review-score":110}', '{"other":50,"review-score":50}'])(
    "ignores invalid saved layout %s",
    (value) => {
      localStorage.setItem(storageKey, value);
      vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
      expect(() => act(() => { render(content()); })).not.toThrow();
      expect(screen.getByRole("textbox", { name: "Черновик" })).toBeInTheDocument();
    }
  );
});
