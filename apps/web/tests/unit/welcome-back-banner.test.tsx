import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { WelcomeBackBanner } from "@/components/guidance/welcome-back-banner";
import { LAST_VISIT_STORAGE_KEY } from "@/lib/guidance/visit-memory";

const analystResetHref = "/reviews?qaAssignee=%D0%90%D0%BD%D0%BD%D0%B0%20QA&due=overdue";

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

    render(<WelcomeBackBanner resetHref={analystResetHref} />);

    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "С возвращением" })).not.toBeInTheDocument();
    });
    expect(storage.get(LAST_VISIT_STORAGE_KEY)).not.toBe(recent);
  });

  it("shows after long absence and resets to the role-home href, not bare /reviews", async () => {
    const stale = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    storage.set(LAST_VISIT_STORAGE_KEY, stale);

    render(
      <WelcomeBackBanner resetHref={analystResetHref} foreignViewName="Критические за период" />
    );

    const region = await screen.findByRole("region", { name: "С возвращением" });
    expect(region).toBeInTheDocument();
    expect(region).toHaveTextContent("Критические за период");

    const reset = screen.getByRole("link", { name: "Сбросить к очереди дня" });
    expect(reset).toHaveAttribute("href", analystResetHref);
    expect(reset).not.toHaveAttribute("href", "/reviews");

    fireEvent.click(screen.getByRole("button", { name: "Скрыть напоминание" }));

    expect(screen.queryByRole("region", { name: "С возвращением" })).not.toBeInTheDocument();
    expect(storage.get(LAST_VISIT_STORAGE_KEY)).toBeTruthy();
    expect(storage.get(LAST_VISIT_STORAGE_KEY)).not.toBe(stale);
  });
});
