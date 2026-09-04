import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { QueueDay1Tour } from "@/components/guidance/queue-day1-tour";
import { DAY1_TOUR_DISMISS_STORAGE_KEY, LAST_VISIT_STORAGE_KEY } from "@/lib/guidance/visit-memory";

describe("QueueDay1Tour", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        clear: () => storage.clear(),
        getItem: (key: string) => storage.get(key) ?? null,
        removeItem: (key: string) => storage.delete(key),
        setItem: (key: string, value: string) => storage.set(key, value)
      }
    });
  });

  it("walks three steps and can be skipped forever", async () => {
    render(<QueueDay1Tour />);

    expect(await screen.findByRole("region", { name: /Обзор очереди, шаг 1/ })).toBeInTheDocument();
    expect(screen.getByText("Взять следующий")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    expect(await screen.findByRole("region", { name: /Обзор очереди, шаг 2/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    expect(await screen.findByRole("region", { name: /Обзор очереди, шаг 3/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Понятно" }));
    expect(screen.queryByRole("region", { name: /Обзор очереди/ })).not.toBeInTheDocument();
    expect(storage.get(DAY1_TOUR_DISMISS_STORAGE_KEY)).toBe("1");
  });

  it("stays hidden when already dismissed", async () => {
    storage.set(DAY1_TOUR_DISMISS_STORAGE_KEY, "1");
    render(<QueueDay1Tour />);

    await waitFor(() => {
      expect(screen.queryByRole("region", { name: /Обзор очереди/ })).not.toBeInTheDocument();
    });
  });

  it("skips while welcome-back absence is active", async () => {
    const stale = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    storage.set(LAST_VISIT_STORAGE_KEY, stale);
    render(<QueueDay1Tour />);

    await waitFor(() => {
      expect(screen.queryByRole("region", { name: /Обзор очереди/ })).not.toBeInTheDocument();
    });
  });
});
