import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeferredChartVisual } from "@/components/charts/deferred-chart-visual.client";

afterEach(() => {
  vi.unstubAllGlobals();
});

function installIntersectionObserver() {
  let callback: IntersectionObserverCallback | undefined;
  let options: IntersectionObserverInit | undefined;
  const disconnect = vi.fn();

  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(
        nextCallback: IntersectionObserverCallback,
        nextOptions?: IntersectionObserverInit
      ) {
        callback = nextCallback;
        options = nextOptions;
      }

      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = disconnect;
    }
  );

  return {
    stayOutside() {
      act(() => {
        callback?.(
          [{ isIntersecting: false } as IntersectionObserverEntry],
          {} as IntersectionObserver
        );
      });
    },
    enter() {
      act(() => {
        callback?.(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          {} as IntersectionObserver
        );
      });
    },
    disconnect,
    get rootMargin() {
      return options?.rootMargin;
    }
  };
}

describe("DeferredChartVisual", () => {
  it("does not load while the observed root remains outside the viewport", () => {
    const observer = installIntersectionObserver();
    const load = vi.fn(async () => ({
      default: () => <svg aria-label="Rich chart" />
    }));

    render(
      <DeferredChartVisual
        load={load}
        componentProps={{}}
        loadingLabel="Загрузка визуального представления"
        fallbackClassName="min-h-60"
      />
    );

    expect(load).not.toHaveBeenCalled();
    observer.stayOutside();
    expect(load).not.toHaveBeenCalled();
  });

  it("loads once at 400px near-viewport intersection and disconnects the observer", async () => {
    const observer = installIntersectionObserver();
    const load = vi.fn(async () => ({
      default: () => <svg aria-label="Rich chart" />
    }));

    render(
      <DeferredChartVisual
        load={load}
        componentProps={{}}
        loadingLabel="Загрузка визуального представления"
        fallbackClassName="min-h-60"
      />
    );

    expect(observer.rootMargin).toBe("400px 0px");

    observer.enter();

    expect(await screen.findByLabelText("Rich chart")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
    expect(observer.disconnect).toHaveBeenCalled();
  });

  it("fails open when IntersectionObserver is unavailable", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const load = vi.fn(async () => ({
      default: () => <svg aria-label="Fail-open chart" />
    }));

    render(
      <DeferredChartVisual
        load={load}
        componentProps={{}}
        loadingLabel="Загрузка визуального представления"
        fallbackClassName="min-h-60"
      />
    );

    expect(await screen.findByLabelText("Fail-open chart")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("arms once from explicit interaction intent", async () => {
    installIntersectionObserver();
    const load = vi.fn(async () => ({
      default: () => <svg aria-label="Interaction-armed chart" />
    }));
    const { rerender } = render(
      <DeferredChartVisual
        load={load}
        componentProps={{}}
        loadingLabel="Загрузка визуального представления"
        fallbackClassName="min-h-60"
      />
    );

    expect(load).not.toHaveBeenCalled();

    rerender(
      <DeferredChartVisual
        load={load}
        componentProps={{}}
        loadingLabel="Загрузка визуального представления"
        fallbackClassName="min-h-60"
        armed
      />
    );

    expect(await screen.findByLabelText("Interaction-armed chart")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);

    rerender(
      <DeferredChartVisual
        load={load}
        componentProps={{}}
        loadingLabel="Загрузка визуального представления"
        fallbackClassName="min-h-60"
        armed
      />
    );
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("disconnects on unmount and ignores a late resolved module", async () => {
    const observer = installIntersectionObserver();
    let resolveModule:
      | ((value: { default: () => React.JSX.Element }) => void)
      | undefined;
    const rendered = vi.fn();
    const load = vi.fn(
      () =>
        new Promise<{ default: () => React.JSX.Element }>((resolve) => {
          resolveModule = resolve;
        })
    );
    const { unmount } = render(
      <DeferredChartVisual
        load={load}
        componentProps={{}}
        loadingLabel="Загрузка визуального представления"
        fallbackClassName="min-h-60"
      />
    );

    observer.enter();
    expect(load).toHaveBeenCalledTimes(1);
    unmount();
    expect(observer.disconnect).toHaveBeenCalled();

    await act(async () => {
      resolveModule?.({
        default: () => {
          rendered();
          return <svg aria-label="Late chart" />;
        }
      });
      await Promise.resolve();
    });

    expect(rendered).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Late chart")).not.toBeInTheDocument();
  });

  it("ignores a late rejected module after unmount", async () => {
    const observer = installIntersectionObserver();
    let rejectModule: ((reason: Error) => void) | undefined;
    const load = vi.fn(
      () =>
        new Promise<{ default: () => React.JSX.Element }>((_resolve, reject) => {
          rejectModule = reject;
        })
    );
    const { unmount } = render(
      <DeferredChartVisual
        load={load}
        componentProps={{}}
        loadingLabel="Загрузка визуального представления"
        fallbackClassName="min-h-60"
      />
    );

    observer.enter();
    unmount();

    await act(async () => {
      rejectModule?.(new Error("late chunk failure"));
      await Promise.resolve();
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps load and render failures local and retries with a fresh attempt", async () => {
    const observer = installIntersectionObserver();
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("chunk unavailable"))
      .mockResolvedValueOnce({
        default: () => <svg aria-label="Recovered chart" />
      });

    render(
      <DeferredChartVisual
        load={load}
        componentProps={{}}
        loadingLabel="Загрузка визуального представления"
        fallbackClassName="min-h-60"
      />
    );

    observer.enter();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Не удалось загрузить график");
    expect(load).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));

    expect(await screen.findByLabelText("Recovered chart")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("contains render failures inside the chart boundary and retries the module", async () => {
    const observer = installIntersectionObserver();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const load = vi
      .fn()
      .mockResolvedValueOnce({
        default: () => {
          throw new Error("chart render failed");
        }
      })
      .mockResolvedValueOnce({
        default: () => <svg aria-label="Render-recovered chart" />
      });

    render(
      <DeferredChartVisual
        load={load}
        componentProps={{}}
        loadingLabel="Загрузка визуального представления"
        fallbackClassName="min-h-60"
      />
    );

    observer.enter();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Не удалось загрузить график"
    );
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));

    expect(await screen.findByLabelText("Render-recovered chart")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });

  it("renders a static aria-hidden skeleton with one finite loading announcement and no loaded announcement", async () => {
    const observer = installIntersectionObserver();
    const load = vi.fn(async () => ({
      default: () => <svg aria-label="Rich chart" />
    }));
    const { container } = render(
      <DeferredChartVisual
        load={load}
        componentProps={{}}
        loadingLabel="Загрузка визуального представления"
        fallbackClassName="min-h-60"
      />
    );

    expect(container.querySelector('[data-slot="skeleton"]')).toHaveAttribute(
      "aria-hidden",
      "true"
    );
    expect(container.querySelector('[data-slot="skeleton"]')).toHaveAttribute(
      "data-qc-motion",
      "none"
    );
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveAccessibleName(
      "Загрузка визуального представления"
    );

    observer.enter();
    await screen.findByLabelText("Rich chart");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText(/график загружен/i)).not.toBeInTheDocument();
  });
});
