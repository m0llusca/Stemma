import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
        defaultOpen={false}
        formId="review-queue-filters"
      >
        <div>Фильтры</div>
      </QueueAdvancedFilters>
    );

    expect(screen.getByRole("button", { name: /^точные фильтры/i })).toHaveTextContent("12 параметров");
  });

  it("opens exact filters in a sheet with an accessible title", async () => {
    render(
      <QueueAdvancedFilters
        activeCount={3}
        parameterCount={12}
        defaultOpen
        formId="review-queue-filters"
      >
        <div>Фильтры</div>
      </QueueAdvancedFilters>
    );

    expect(screen.getByRole("button", { name: /^точные фильтры/i, hidden: true })).toHaveTextContent(
      "3 применено"
    );
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Точные фильтры" })).toBeInTheDocument();
  });

  it("does not auto-open the sheet when welcome-back is eligible", async () => {
    const stale = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    window.localStorage.setItem(LAST_VISIT_STORAGE_KEY, stale);

    render(
      <QueueAdvancedFilters
        activeCount={3}
        parameterCount={12}
        defaultOpen
        formId="review-queue-filters"
      >
        <div>Фильтры</div>
      </QueueAdvancedFilters>
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^точные фильтры/i })).toBeVisible();
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reinforces progressive disclosure help near exact filters", () => {
    render(
      <QueueAdvancedFilters
        activeCount={0}
        parameterCount={12}
        defaultOpen={false}
        formId="review-queue-filters"
      >
        <div>Фильтры</div>
      </QueueAdvancedFilters>
    );

    expect(screen.getByText(/Редкие срезы \(источник, SLA, риск\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /зачем точные фильтры/i })).toBeInTheDocument();
  });
});
