import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { QueueAdvancedFilters } from "@/components/review/queue-advanced-filters";
import { LAST_VISIT_STORAGE_KEY } from "@/lib/guidance/visit-memory";

describe("QueueAdvancedFilters", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows the total number of exact filter parameters when no filters are active", () => {
    render(
      <QueueAdvancedFilters
        activeCount={0}
        parameterCount={12}
        formId="review-queue-filters"
        preserveValues={[]}
      >
        <div>Фильтры</div>
      </QueueAdvancedFilters>
    );

    expect(screen.getByRole("button", { name: /^точные фильтры/i })).toHaveTextContent("12 параметров");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens exact filters only after an explicit click", async () => {
    render(
      <QueueAdvancedFilters
        activeCount={3}
        parameterCount={12}
        formId="review-queue-filters"
        preserveValues={[{ name: "qaStatus", value: "QUEUED" }]}
      >
        <div>Фильтры</div>
      </QueueAdvancedFilters>
    );

    expect(screen.getByRole("button", { name: /^точные фильтры/i })).toHaveTextContent(
      "3 применено"
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^точные фильтры/i }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Точные фильтры" })).toBeInTheDocument();
  });

  it("keeps active exact params in the closed form so the queue stays clickable", () => {
    const stale = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    window.localStorage.setItem(LAST_VISIT_STORAGE_KEY, stale);

    const { container } = render(
      <form id="review-queue-filters">
        <QueueAdvancedFilters
          activeCount={3}
          parameterCount={12}
          formId="review-queue-filters"
          preserveValues={[{ name: "qaStatus", value: "QUEUED" }]}
        >
          <label>
            Статус проверки
            <select name="qaStatus" form="review-queue-filters" defaultValue="QUEUED">
              <option value="QUEUED">В очереди</option>
            </select>
          </label>
        </QueueAdvancedFilters>
      </form>
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="sheet-overlay"]')).not.toBeInTheDocument();
    expect(new FormData(container.querySelector("form") as HTMLFormElement).get("qaStatus")).toBe(
      "QUEUED"
    );
    expect(container.querySelector('[data-slot="exact-filter-mirror"]')).toHaveAttribute(
      "name",
      "qaStatus"
    );
  });

  it("reinforces progressive disclosure help near exact filters", () => {
    render(
      <QueueAdvancedFilters
        activeCount={0}
        parameterCount={12}
        formId="review-queue-filters"
        preserveValues={[]}
      >
        <div>Фильтры</div>
      </QueueAdvancedFilters>
    );

    expect(screen.getByText(/Редкие срезы \(источник, SLA, риск\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /зачем точные фильтры/i })).toBeInTheDocument();
  });

  it("drops mirrors while the sheet is open so names do not double-submit", async () => {
    const { container } = render(
      <form id="review-queue-filters">
        <QueueAdvancedFilters
          activeCount={1}
          parameterCount={12}
          formId="review-queue-filters"
          preserveValues={[{ name: "due", value: "overdue" }]}
        >
          <label>
            Срок
            <select name="due" form="review-queue-filters" defaultValue="overdue">
              <option value="overdue">Просрочено</option>
            </select>
          </label>
        </QueueAdvancedFilters>
      </form>
    );

    fireEvent.click(screen.getByRole("button", { name: /^точные фильтры/i }));
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
    expect(container.querySelector('[data-slot="exact-filter-mirror"]')).not.toBeInTheDocument();
    expect(new FormData(container.querySelector("form") as HTMLFormElement).get("due")).toBe(
      "overdue"
    );
  });
});
