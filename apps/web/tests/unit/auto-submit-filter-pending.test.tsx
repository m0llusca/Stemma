import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AutoSubmitFilterForm } from "@/components/ui/auto-submit-filter-form";

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.routerPush
  })
}));

describe("AutoSubmitFilterForm pending affordance", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.routerPush.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not show the pending indicator at rest", () => {
    const { container } = render(
      <AutoSubmitFilterForm action="/reports">
        <select name="period" defaultValue="vk-current" aria-label="Период">
          <option value="vk-current">Текущий период</option>
          <option value="calendar-current">Текущий месяц</option>
        </select>
      </AutoSubmitFilterForm>
    );

    const form = container.querySelector("form");
    expect(screen.queryByTestId("filter-pending")).not.toBeInTheDocument();
    expect(form?.getAttribute("aria-busy")).toBe("false");
  });

  it("reveals a visible pending indicator while a filter change is in flight", () => {
    // Hold the navigation open so the transition stays pending and the
    // affordance must be rendered for the duration.
    mocks.routerPush.mockImplementation(() => new Promise<void>(() => {}));

    const { container } = render(
      <AutoSubmitFilterForm action="/reports">
        <select name="period" defaultValue="vk-current" aria-label="Период">
          <option value="vk-current">Текущий период</option>
          <option value="calendar-current">Текущий месяц</option>
        </select>
      </AutoSubmitFilterForm>
    );

    act(() => {
      fireEvent.change(screen.getByLabelText("Период"), { target: { value: "calendar-current" } });
    });

    act(() => {
      vi.runOnlyPendingTimers();
    });

    const form = container.querySelector("form");
    expect(form?.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByTestId("filter-pending")).toBeInTheDocument();
  });
});
