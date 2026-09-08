import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeferredChartVisual } from "@/components/charts/deferred-chart-visual.client";

describe("DeferredChartVisual", () => {
  it("renders the statically imported visual immediately — no pending shell", () => {
    render(
      <DeferredChartVisual
        Visual={() => <svg aria-label="Rich chart" />}
        componentProps={{}}
      />
    );

    expect(screen.getByLabelText("Rich chart")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText("Загрузка визуального представления")).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="deferred-chart-visual"]')).toHaveAttribute(
      "data-deferred-state",
      "ready"
    );
  });

  it("contains render failures inside the chart boundary and retries the visual", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const state = { shouldThrow: true };

    function FlakyVisual() {
      if (state.shouldThrow) {
        throw new Error("chart render failed");
      }

      return <svg aria-label="Render-recovered chart" />;
    }

    render(
      <DeferredChartVisual Visual={FlakyVisual} componentProps={{}} />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Не удалось загрузить график");
    expect(screen.queryByLabelText("Render-recovered chart")).not.toBeInTheDocument();

    state.shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));

    expect(screen.getByLabelText("Render-recovered chart")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    consoleError.mockRestore();
  });
});
