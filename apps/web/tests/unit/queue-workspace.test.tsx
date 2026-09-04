import "@testing-library/jest-dom/vitest";
import { act, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { QueueWorkspace } from "@/components/review/queue-workspace";

function installDesktopMediaQuery() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  );
}

afterEach(() => {
  document.documentElement.style.removeProperty("--app-topbar-height");
  vi.unstubAllGlobals();
});

it("owns queue structure without caller-supplied layout classes", () => {
  const { container } = render(
    <QueueWorkspace
      description="Разбирайте обращения по SLA"
      actions={<button>Взять следующий</button>}
    >
      <QueueWorkspace.Kpis aria-label="Сводка очереди">
        <div>4 ожидают</div>
      </QueueWorkspace.Kpis>
      <QueueWorkspace.CommandBar aria-label="Фильтры и виды очереди">
        <div>Фильтры</div>
      </QueueWorkspace.CommandBar>
      <QueueWorkspace.Main
        aria-label="Рабочая область очереди"
        preview={<div>Следующий кейс</div>}
        previewLabel="Предпросмотр следующего обращения"
      >
        <div>Список</div>
      </QueueWorkspace.Main>
    </QueueWorkspace>
  );

  expect(
    screen.getByRole("heading", { name: "Очередь проверок" })
  ).toBeInTheDocument();
  for (const slot of [
    "review-queue-workspace",
    "review-queue-kpis",
    "review-queue-command-sentinel",
    "review-queue-command-bar",
    "review-queue-list",
    "review-queue-preview"
  ]) {
    expect(container.querySelector(`[data-slot="${slot}"]`)).toBeInTheDocument();
  }
});

it("server-renders every route region under one workspace owner", () => {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(
    <QueueWorkspace
      description="Разбирайте обращения по SLA"
      actions={<button>Маршрутное действие</button>}
    >
      <QueueWorkspace.Kpis aria-label="Сводка очереди">
        <div>Маршрутные KPI</div>
      </QueueWorkspace.Kpis>
      <QueueWorkspace.CommandBar
        aria-label="Фильтры и виды очереди"
        expandedOnly={<div>Маршрутные сохранённые виды</div>}
        stuckOnly={<div>Маршрутные компактные счётчики</div>}
      >
        <div>Маршрутные стабильные фильтры</div>
      </QueueWorkspace.CommandBar>
      <QueueWorkspace.Main
        aria-label="Рабочая область очереди"
        preview={<div>Маршрутный предпросмотр</div>}
        previewLabel="Предпросмотр следующего обращения"
      >
        <div>Маршрутный список</div>
      </QueueWorkspace.Main>
    </QueueWorkspace>
  );

  const routeRegions = within(container);
  const workspace = container.querySelector(
    '[data-slot="review-queue-workspace"]'
  );
  const commandBar = container.querySelector(
    '[data-slot="review-queue-command-bar"]'
  );

  expect(workspace).not.toBeNull();
  expect(routeRegions.getAllByText("Маршрутное действие")).toHaveLength(1);
  expect(routeRegions.getByText("Маршрутное действие").closest("header"))
    .not.toBeNull();

  const ownedRegions = [
    ["Маршрутные KPI", "review-queue-kpis"],
    ["Маршрутный список", "review-queue-list"],
    ["Маршрутный предпросмотр", "review-queue-preview"]
  ] as const;
  for (const [content, slot] of ownedRegions) {
    const region = routeRegions.getByText(content);
    expect(routeRegions.getAllByText(content)).toHaveLength(1);
    expect(region.closest(`[data-slot="${slot}"]`)).not.toBeNull();
    expect(workspace).toContainElement(region);
  }

  const expandedViews = routeRegions.getByText(
    "Маршрутные сохранённые виды"
  );
  expect(routeRegions.getAllByText("Маршрутные сохранённые виды")).toHaveLength(
    1
  );
  expect(expandedViews.closest("[data-expanded-only]")).not.toBeNull();
  expect(commandBar).toContainElement(expandedViews);

  const compactCounts = routeRegions.getByText(
    "Маршрутные компактные счётчики"
  );
  expect(
    routeRegions.getAllByText("Маршрутные компактные счётчики")
  ).toHaveLength(1);
  expect(compactCounts.closest("[data-stuck-only]")).not.toBeNull();
  expect(commandBar).toContainElement(compactCounts);

  const stableFilters = routeRegions.getByText(
    "Маршрутные стабильные фильтры"
  );
  expect(routeRegions.getAllByText("Маршрутные стабильные фильтры")).toHaveLength(
    1
  );
  expect(commandBar).toContainElement(stableFilters);
  expect(stableFilters.closest("[data-expanded-only]")).toBeNull();
  expect(stableFilters.closest("[data-stuck-only]")).toBeNull();
});

it("switches command-bar presentation when its sentinel crosses the sticky edge", () => {
  installDesktopMediaQuery();
  document.documentElement.style.setProperty("--app-topbar-height", "52px");

  let observerCallback: IntersectionObserverCallback | undefined;
  let observer: IntersectionObserver;

  class TestIntersectionObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = "-52px 0px 0px 0px";
    readonly thresholds = [0];

    constructor(callback: IntersectionObserverCallback) {
      observerCallback = callback;
      observer = this;
    }

    disconnect() {}
    observe() {}
    takeRecords() {
      return [];
    }
    unobserve() {}
  }

  vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);

  render(
    <QueueWorkspace.CommandBar
      aria-label="Фильтры и виды очереди"
      expandedOnly={<div>Сохранённые виды</div>}
      stuckOnly={<div>4 ожидают</div>}
    >
      <div>Фильтры</div>
    </QueueWorkspace.CommandBar>
  );

  const commandBar = screen.getByLabelText("Фильтры и виды очереди");
  expect(commandBar).toHaveAttribute("data-state", "resting");

  act(() => {
    observerCallback?.(
      [{ isIntersecting: false } as IntersectionObserverEntry],
      observer
    );
  });
  expect(commandBar).toHaveAttribute("data-state", "stuck");

  act(() => {
    observerCallback?.(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      observer
    );
  });
  expect(commandBar).toHaveAttribute("data-state", "resting");
});

it("restores focus into the sticky bar when stuck mode hides the focused control", () => {
  installDesktopMediaQuery();
  document.documentElement.style.setProperty("--app-topbar-height", "52px");

  let observerCallback: IntersectionObserverCallback | undefined;
  let observer: IntersectionObserver;

  class TestIntersectionObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = "-52px 0px 0px 0px";
    readonly thresholds = [0];

    constructor(callback: IntersectionObserverCallback) {
      observerCallback = callback;
      observer = this;
    }

    disconnect() {}
    observe() {}
    takeRecords() {
      return [];
    }
    unobserve() {}
  }

  vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);

  render(
    <QueueWorkspace.CommandBar
      aria-label="Фильтры и виды очереди"
      expandedOnly={<button type="button">Сохранённые виды</button>}
      stuckOnly={<div>4 ожидают</div>}
    >
      <button type="button">Фильтры</button>
    </QueueWorkspace.CommandBar>
  );

  const expandedControl = screen.getByRole("button", { name: "Сохранённые виды" });
  expandedControl.focus();
  expect(expandedControl).toHaveFocus();

  act(() => {
    observerCallback?.(
      [{ isIntersecting: false } as IntersectionObserverEntry],
      observer
    );
  });

  expect(screen.getByLabelText("Фильтры и виды очереди")).toHaveAttribute(
    "data-state",
    "stuck"
  );
  expect(screen.getByRole("button", { name: "Фильтры" })).toHaveFocus();
});

it(
  "keeps the full resting presentation when IntersectionObserver is unavailable",
  () => {
    installDesktopMediaQuery();
    vi.stubGlobal("IntersectionObserver", undefined);

    render(
      <QueueWorkspace.CommandBar
        aria-label="Фильтры и виды очереди"
        expandedOnly={<div>Сохранённые виды</div>}
        stuckOnly={<div>4 ожидают</div>}
      >
        <div>Фильтры</div>
      </QueueWorkspace.CommandBar>
    );

    expect(screen.getByLabelText("Фильтры и виды очереди")).toHaveAttribute(
      "data-state",
      "resting"
    );
    expect(screen.getByText("Фильтры")).toBeInTheDocument();
    expect(screen.getByText("Сохранённые виды")).toBeInTheDocument();
  }
);

