import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "@/components/ui/modal";

function Harness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        open
      </button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          onClose?.();
        }}
        title="Подтверждение"
      >
        <button type="button">first</button>
        <button type="button">second</button>
      </Modal>
    </div>
  );
}

describe("Modal (shadcn Dialog)", () => {
  it("renders nothing while closed", () => {
    render(<Harness />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders a labelled modal dialog when open", async () => {
    render(<Harness />);
    act(() => {
      fireEvent.click(screen.getByText("open"));
    });

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleName("Подтверждение");
    expect(screen.getByText("first")).toBeInTheDocument();
  });

  it("closes on Escape via Dialog", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    act(() => {
      fireEvent.click(screen.getByText("open"));
    });
    await screen.findByRole("dialog");

    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("renders children inside the dialog content", async () => {
    render(<Harness />);
    act(() => {
      fireEvent.click(screen.getByText("open"));
    });
    await screen.findByRole("dialog");
    expect(screen.getByText("first")).toBeInTheDocument();
    expect(screen.getByText("second")).toBeInTheDocument();
  });
});
