import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToastProvider, useToast } from "@/components/ui/toast";

function Trigger() {
  const toast = useToast();
  return (
    <div>
      <button type="button" onClick={() => toast.success("Сохранено")}>
        ok
      </button>
      <button type="button" onClick={() => toast.error("Не удалось")}>
        fail
      </button>
    </div>
  );
}

describe("ToastProvider", () => {
  it("renders a polite aria-live region", () => {
    render(
      <ToastProvider>
        <span>child</span>
      </ToastProvider>
    );

    const list = document.querySelector(".toast-region__list");
    expect(list).not.toBeNull();
    expect(list?.getAttribute("aria-live")).toBe("polite");
  });

  it("shows success and error toasts pushed through the hook", () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );

    act(() => {
      fireEvent.click(screen.getByText("ok"));
    });
    expect(screen.getByText("Сохранено")).toBeInTheDocument();
    expect(document.querySelector('.toast[data-tone="success"]')).not.toBeNull();

    act(() => {
      fireEvent.click(screen.getByText("fail"));
    });
    expect(screen.getByText("Не удалось")).toBeInTheDocument();
    expect(document.querySelector('.toast[data-tone="error"]')).not.toBeNull();
  });

  it("dismisses a toast via its close button", () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );

    act(() => {
      fireEvent.click(screen.getByText("ok"));
    });
    expect(screen.getByText("Сохранено")).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Закрыть уведомление" }));
    });
    expect(screen.queryByText("Сохранено")).not.toBeInTheDocument();
  });

  it("throws a clear error when useToast is used without a provider", () => {
    function Orphan() {
      useToast();
      return null;
    }

    expect(() => render(<Orphan />)).toThrow(/ToastProvider/);
  });
});
