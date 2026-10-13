import "@testing-library/jest-dom/vitest";
import { act, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChartPlotWidth } from "@/components/charts/use-chart-plot-width";

function Example() {
  const ref = useRef<HTMLDivElement>(null);
  const width = useChartPlotWidth(ref, 720);
  return <div ref={ref}><output aria-label="Ширина геометрии">{width}</output></div>;
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("measured plot width", () => {
  it("keeps SSR geometry positive and updates one width through layout measurement and resize", () => {
    expect(renderToStaticMarkup(<Example />)).toContain(">720</output>");
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 264 } as DOMRect);
    let resize: ResizeObserverCallback;
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: ResizeObserverCallback) { resize = callback; }
      observe() {}
      disconnect = disconnect;
    });
    const { unmount } = render(<Example />);
    expect(screen.getByLabelText("Ширина геометрии")).toHaveTextContent("264");
    act(() => resize!([{ contentRect: { width: 334.2 } } as ResizeObserverEntry], {} as ResizeObserver));
    expect(screen.getByLabelText("Ширина геометрии")).toHaveTextContent("334");
    for (const width of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      act(() => resize!([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver));
      expect(screen.getByLabelText("Ширина геометрии")).toHaveTextContent("334");
    }
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
