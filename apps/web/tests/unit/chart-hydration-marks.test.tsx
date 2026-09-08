import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeferredChartVisual } from "@/components/charts/deferred-chart-visual.client";

// Task 10 hydration-mark contract:
// - "qc-chart-hydration-start" is recorded once per document, at module
//   evaluation of the rich renderer
//   (src/components/charts/recharts-visuals.client.tsx);
// - "qc-chart-hydration-end" is recorded by the island in the first
//   settled layout effect after the statically imported visual is committed,
//   at most once per island instance;
// - both marks are guarded on `typeof performance !== "undefined"` and on
//   `performance.mark` being a function.

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function markCalls(
  spy: { mock: { calls: ReadonlyArray<ReadonlyArray<unknown>> } },
  name: string
) {
  return spy.mock.calls.filter((call) => call[0] === name);
}

describe("chart hydration marks", () => {
  it("records qc-chart-hydration-end in the first settled layout effect after the island is ready, once per island", () => {
    const markSpy = vi.spyOn(performance, "mark");

    const { rerender } = render(
      <DeferredChartVisual
        Visual={() => <svg aria-label="Rich chart" />}
        componentProps={{}}
      />
    );

    expect(screen.getByLabelText("Rich chart")).toBeInTheDocument();
    expect(markCalls(markSpy, "qc-chart-hydration-end")).toHaveLength(1);

    rerender(
      <DeferredChartVisual
        Visual={() => <svg aria-label="Rich chart" />}
        componentProps={{}}
      />
    );

    expect(markCalls(markSpy, "qc-chart-hydration-end")).toHaveLength(1);
  });

  it("skips the end mark without crashing when performance.mark is not a function", () => {
    vi.stubGlobal("performance", {
      now: () => Date.now(),
      mark: "disabled",
      getEntriesByName: () => []
    });

    render(
      <DeferredChartVisual
        Visual={() => <svg aria-label="Guarded chart" />}
        componentProps={{}}
      />
    );

    expect(screen.getByLabelText("Guarded chart")).toBeInTheDocument();
  });

  it("records qc-chart-hydration-start once at rich module evaluation and not on cached re-imports", async () => {
    vi.resetModules();
    const markSpy = vi.spyOn(performance, "mark");

    await import("@/components/charts/recharts-visuals.client");
    expect(markCalls(markSpy, "qc-chart-hydration-start")).toHaveLength(1);

    await import("@/components/charts/recharts-visuals.client");
    expect(markCalls(markSpy, "qc-chart-hydration-start")).toHaveLength(1);
  });

  it("evaluates the rich module without crashing when performance is undefined", async () => {
    vi.resetModules();
    vi.stubGlobal("performance", undefined);

    await expect(
      import("@/components/charts/recharts-visuals.client")
    ).resolves.toBeDefined();
  });
});
