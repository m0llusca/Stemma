import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { WelcomeBackBanner } from "@/components/guidance/welcome-back-banner";
import { LAST_VISIT_STORAGE_KEY } from "@/lib/guidance/visit-memory";

describe("WelcomeBackBanner", () => {
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

  it("stays hidden for a recent visit and touches lastVisit", async () => {
    const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    storage.set(LAST_VISIT_STORAGE_KEY, recent);

    render(<WelcomeBackBanner />);

    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "С возвращением" })).not.toBeInTheDocument();
    });
    expect(storage.get(LAST_VISIT_STORAGE_KEY)).not.toBe(recent);
  });

  it("shows after long absence and dismisses with safe reset CTA", async () => {
    const stale = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    storage.set(LAST_VISIT_STORAGE_KEY, stale);

    render(<WelcomeBackBanner />);

    const region = await screen.findByRole("region", { name: "С возвращением" });
    expect(region).toBeInTheDocument();

    const reset = screen.getByRole("link", { name: "Сбросить к безопасному виду" });
    expect(reset).toHaveAttribute("href", "/reviews");

    fireEvent.click(screen.getByRole("button", { name: "Скрыть напоминание" }));

    expect(screen.queryByRole("region", { name: "С возвращением" })).not.toBeInTheDocument();
    expect(storage.get(LAST_VISIT_STORAGE_KEY)).toBeTruthy();
    expect(storage.get(LAST_VISIT_STORAGE_KEY)).not.toBe(stale);
  });
});
