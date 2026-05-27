import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { QueueAdvancedFilters } from "@/components/review/queue-advanced-filters";

describe("QueueAdvancedFilters", () => {
  it("shows the total number of exact filter parameters when no filters are active", () => {
    render(
      <QueueAdvancedFilters activeCount={0} parameterCount={11} defaultOpen={false}>
        <div>Фильтры</div>
      </QueueAdvancedFilters>
    );

    expect(screen.getByRole("button", { name: /точные фильтры/i })).toHaveTextContent("11 параметров");
  });

  it("shows the active filter count when exact filters are applied", () => {
    render(
      <QueueAdvancedFilters activeCount={3} parameterCount={11} defaultOpen={false}>
        <div>Фильтры</div>
      </QueueAdvancedFilters>
    );

    expect(screen.getByRole("button", { name: /точные фильтры/i })).toHaveTextContent("3 применено");
  });
});
