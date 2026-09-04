import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { QueueAdvancedFilters } from "@/components/review/queue-advanced-filters";

describe("QueueAdvancedFilters", () => {
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

  it("opens exact filters in a sheet with an accessible title", () => {
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
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Точные фильтры" })).toBeInTheDocument();
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
