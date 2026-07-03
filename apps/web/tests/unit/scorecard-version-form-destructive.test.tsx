import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScorecardVersionForm } from "@/components/scorecards/scorecard-version-form";

vi.mock("@/lib/scorecard-actions", () => ({
  createScorecardVersion: vi.fn(),
  updateScorecardVersion: vi.fn()
}));

const initialCriteria = [
  {
    id: "crit-1",
    key: "greeting",
    label: "Приветствие",
    block: "Коммуникация",
    kind: "SCALE_1_3" as const,
    weight: 50,
    required: true
  },
  {
    id: "crit-2",
    key: "solution",
    label: "Решение вопроса",
    block: "Суть",
    kind: "SCALE_1_3" as const,
    weight: 50,
    required: true
  }
];

function renderForm() {
  return render(<ScorecardVersionForm initialName="Форма v1" initialCriteria={initialCriteria} />);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("scorecard version form destructive actions", () => {
  it("keeps the criterion when the deletion confirm is dismissed", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderForm();

    fireEvent.click(screen.getAllByTitle("Удалить")[0]);

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toContain("Удалить критерий «Приветствие»?");
    expect(screen.getByText("Приветствие")).toBeDefined();
    expect(screen.getAllByTitle("Удалить")).toHaveLength(2);
  });

  it("removes the criterion after the deletion is confirmed", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderForm();

    fireEvent.click(screen.getAllByTitle("Удалить")[0]);

    expect(screen.queryByText("Приветствие")).toBeNull();
    expect(screen.getAllByTitle("Удалить")).toHaveLength(1);
  });

  it("keeps the submit button always enabled and blocks submit inline when weights are off", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderForm();

    // Delete one criterion: total weight becomes 50 — the button must stay enabled.
    fireEvent.click(screen.getAllByTitle("Удалить")[0]);

    const submit = screen.getByRole("button", { name: "Создать новую версию" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);

    const form = submit.closest("form");
    expect(form).not.toBeNull();

    const submitEvent = new Event("submit", { bubbles: true, cancelable: true });
    form?.dispatchEvent(submitEvent);

    expect(submitEvent.defaultPrevented).toBe(true);
    expect(screen.getByText(/Сумма весов/)).toBeDefined();
  });
});
