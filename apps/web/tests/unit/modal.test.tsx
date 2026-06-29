import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Modal } from "@/components/ui/modal";

function Harness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <div>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
        open
      </button>
      <button type="button">outside</button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          onClose?.();
        }}
        title="Подтверждение"
        triggerRef={triggerRef}
      >
        <button type="button">first</button>
        <button type="button">second</button>
      </Modal>
    </div>
  );
}

afterEach(() => {
  // RTL auto-cleanup unmounts the tree (and its portal) between tests; only the
  // body scroll-lock side effect needs an explicit reset.
  document.body.style.overflow = "";
});

describe("Modal", () => {
  it("renders nothing while closed", () => {
    render(<Harness />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders a labelled modal dialog when open", () => {
    render(<Harness />);
    act(() => {
      fireEvent.click(screen.getByText("open"));
    });

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Подтверждение");
  });

  it("locks body scroll while open and restores it on close", () => {
    render(<Harness />);
    expect(document.body.style.overflow).toBe("");

    act(() => {
      fireEvent.click(screen.getByText("open"));
    });
    expect(document.body.style.overflow).toBe("hidden");

    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(document.body.style.overflow).toBe("");
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    act(() => {
      fireEvent.click(screen.getByText("open"));
    });

    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on backdrop click but not on panel click", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    act(() => {
      fireEvent.click(screen.getByText("open"));
    });

    // Press inside the panel: stays open.
    act(() => {
      fireEvent.mouseDown(screen.getByText("first"));
    });
    expect(onClose).not.toHaveBeenCalled();

    // Press on the backdrop itself: closes.
    const backdrop = document.querySelector(".modal-backdrop") as HTMLElement;
    act(() => {
      fireEvent.mouseDown(backdrop, { target: backdrop });
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("restores focus to the trigger after closing", () => {
    render(<Harness />);
    const trigger = screen.getByText("open");
    act(() => {
      fireEvent.click(trigger);
    });

    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(document.activeElement).toBe(trigger);
  });

  it("wraps Tab focus within the dialog", () => {
    render(<Harness />);
    act(() => {
      fireEvent.click(screen.getByText("open"));
    });

    const second = screen.getByText("second");
    second.focus();
    expect(document.activeElement).toBe(second);

    // Forward Tab from the last focusable wraps to the first.
    act(() => {
      fireEvent.keyDown(document, { key: "Tab" });
    });
    // The dialog close button or "first" should hold focus — never an element
    // outside the dialog.
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});
