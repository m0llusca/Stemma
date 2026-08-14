import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "@/components/ui/toast";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  });
});

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", resolvedTheme: "light", setTheme: vi.fn() })
}));

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
  it("mounts a sonner notifications region with polite aria-live", () => {
    render(
      <ToastProvider>
        <span>child</span>
      </ToastProvider>
    );

    // Sonner always mounts the outer section; the ol[data-sonner-toaster] appears only when toasts exist.
    const liveRegion = document.querySelector('section[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion?.getAttribute("aria-label") ?? "").toMatch(/Notifications/i);
  });

  it("shows success and error toasts pushed through the hook", async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );

    act(() => {
      fireEvent.click(screen.getByText("ok"));
    });
    expect(await screen.findByText("Сохранено")).toBeInTheDocument();
    expect(document.querySelector('[data-sonner-toast][data-type="success"]')).not.toBeNull();

    act(() => {
      fireEvent.click(screen.getByText("fail"));
    });
    expect(await screen.findByText("Не удалось")).toBeInTheDocument();
    expect(document.querySelector('[data-sonner-toast][data-type="error"]')).not.toBeNull();
  });

  it("dismisses a toast via its close button", async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );

    act(() => {
      fireEvent.click(screen.getByText("ok"));
    });
    expect(await screen.findByText("Сохранено")).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Close toast" }));
    });
    await waitFor(() => {
      expect(screen.queryByText("Сохранено")).not.toBeInTheDocument();
    });
  });

  it("throws a clear error when useToast is used without a provider", () => {
    function Orphan() {
      useToast();
      return null;
    }

    expect(() => render(<Orphan />)).toThrow(/ToastProvider/);
  });
});
