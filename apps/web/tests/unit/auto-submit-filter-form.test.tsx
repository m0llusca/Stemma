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

describe("AutoSubmitFilterForm", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.routerPush.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
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
});
