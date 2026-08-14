import "@testing-library/jest-dom/vitest";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeferredChartVisual } from "@/components/charts/deferred-chart-visual.client";

// Task 10 hydration-mark contract:
// - "qc-chart-hydration-start" is recorded once per document, at module
//   evaluation of the deferred rich renderer
//   (src/components/charts/recharts-visuals.client.tsx);
// - "qc-chart-hydration-end" is recorded by the deferred island in the first
//   settled layout effect after the loaded component is committed, at most
//   once per island instance;
// - both marks are guarded on `typeof performance !== "undefined"` and on
//   `performance.mark` being a function.

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function installIntersectionObserver() {
  let callback: IntersectionObserverCallback | undefined;

  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(nextCallback: IntersectionObserverCallback) {
        callback = nextCallback;
      }

      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
  );

  return {
    enter() {
      act(() => {
        callback?.(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          {} as IntersectionObserver
        );
      });
    }
  };
}

function markCalls(
  spy: { mock: { calls: ReadonlyArray<ReadonlyArray<unknown>> } },
  name: string
) {
  return spy.mock.calls.filter((call) => call[0] === name);
}

describe("chart hydration marks", () => {
  it("records qc-chart-hydration-end in the first settled layout effect after the island is ready, once per island", async () => {
    const observer = installIntersectionObserver();
    const markSpy = vi.spyOn(performance, "mark");
    const load = vi.fn(async () => ({
      default: () => <svg aria-label="Rich chart" />
    }));

    const { rerender } = render(
      <DeferredChartVisual
        load={load}
        componentProps={{}}
        loadingLabel="Загрузка визуального представления"
        fallbackClassName="min-h-60"
      />
    );

    expect(markCalls(markSpy, "qc-chart-hydration-end")).toHaveLength(0);

    observer.enter();
    await screen.findByLabelText("Rich chart");

    expect(markCalls(markSpy, "qc-chart-hydration-end")).toHaveLength(1);

    rerender(
      <DeferredChartVisual
        load={load}
        componentProps={{}}
        loadingLabel="Загрузка визуального представления"
        fallbackClassName="min-h-60"
      />
    );

    expect(markCalls(markSpy, "qc-chart-hydration-end")).toHaveLength(1);
  });

  it("skips the end mark without crashing when performance.mark is not a function", async () => {
    const observer = installIntersectionObserver();
    // performance without a callable mark: the typeof guard must skip the
    // instrumentation while the chart still renders. React captured its own
    // performance reference at module initialization, so stubbing the global
    // here only affects the component under test.
    vi.stubGlobal("performance", {
      now: () => Date.now(),
      mark: "disabled",
      getEntriesByName: () => []
    });
    const load = vi.fn(async () => ({
      default: () => <svg aria-label="Guarded chart" />
    }));

    render(
      <DeferredChartVisual
        load={load}
        componentProps={{}}
        loadingLabel="Загрузка визуального представления"
        fallbackClassName="min-h-60"
      />
    );

    observer.enter();
    expect(await screen.findByLabelText("Guarded chart")).toBeInTheDocument();
  });

  it("records qc-chart-hydration-start once at rich module evaluation and not on cached re-imports", async () => {
    vi.resetModules();
    const markSpy = vi.spyOn(performance, "mark");

    await import("@/components/charts/recharts-visuals.client");
    expect(markCalls(markSpy, "qc-chart-hydration-start")).toHaveLength(1);

    // A cached import must not re-evaluate the module or duplicate the mark.
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
