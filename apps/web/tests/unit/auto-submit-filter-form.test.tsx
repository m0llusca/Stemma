import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AutoSubmitFilterForm } from "@/components/ui/auto-submit-filter-form";
import { actionFlowNavigation } from "@/lib/action-result-bridge";

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.routerPush
  })
}));

describe("AutoSubmitFilterForm", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.routerPush.mockClear();
    window.history.replaceState(null, "", "/reviews");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("updates filter params without forcing the page back to the top", async () => {
    render(
      <AutoSubmitFilterForm action="/reports">
        <input type="hidden" name="view" value="overview" />
        <select name="period" defaultValue="vk-current" aria-label="Период">
          <option value="vk-current">Текущий период</option>
          <option value="calendar-current">Текущий месяц</option>
        </select>
      </AutoSubmitFilterForm>
    );

    fireEvent.change(screen.getByLabelText("Период"), { target: { value: "calendar-current" } });

    await act(async () => {
      vi.runOnlyPendingTimers();
    });

    expect(mocks.routerPush).toHaveBeenCalledWith("/reports?view=overview&period=calendar-current", { scroll: false });
  });

  it("forces a full navigation when the router push never commits", async () => {
    const assign = vi
      .spyOn(actionFlowNavigation, "assign")
      .mockImplementation(vi.fn());
    render(
      <AutoSubmitFilterForm action="/reviews">
        <input type="search" name="q" defaultValue="" />
      </AutoSubmitFilterForm>
    );

    fireEvent.input(screen.getByRole("searchbox"), {
      target: { value: "Мила" }
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(mocks.routerPush).toHaveBeenCalledWith("/reviews?q=%D0%9C%D0%B8%D0%BB%D0%B0", {
      scroll: false
    });

    await vi.advanceTimersByTimeAsync(2100);
    expect(assign).toHaveBeenCalledWith("/reviews?q=%D0%9C%D0%B8%D0%BB%D0%B0");
  });

  it("does not force a navigation after a healthy commit", async () => {
    const assign = vi
      .spyOn(actionFlowNavigation, "assign")
      .mockImplementation(vi.fn());
    const view = render(
      <AutoSubmitFilterForm action="/reviews">
        <input type="search" name="q" defaultValue="" />
      </AutoSubmitFilterForm>
    );

    fireEvent.input(screen.getByRole("searchbox"), {
      target: { value: "Мила" }
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(mocks.routerPush).toHaveBeenCalledWith("/reviews?q=%D0%9C%D0%B8%D0%BB%D0%B0", {
      scroll: false
    });

    // The router commit lands: the address bar reaches the target, and the
    // next render clears the armed fallback.
    window.history.replaceState(null, "", "/reviews?q=%D0%9C%D0%B8%D0%BB%D0%B0");
    view.rerender(
      <AutoSubmitFilterForm action="/reviews">
        <input type="search" name="q" defaultValue="Мила" />
      </AutoSubmitFilterForm>
    );

    await vi.advanceTimersByTimeAsync(2100);
    expect(assign).not.toHaveBeenCalled();
  });
});
