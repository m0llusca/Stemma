import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChartFrame } from "@/components/charts/chart-frame";
import { chartViewLinkProps } from "@/components/charts/chart-view-links";
import type { ChartModel } from "@/lib/charts/contracts";

const navigation = vi.hoisted(() => ({
  pathname: "/reports",
  searchParams:
    "view=overview&period=custom&start=2026-07-01&end=2026-07-31&team=enterprise&chartView=graph",
  refresh: vi.fn()
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ refresh: navigation.refresh }),
  useSearchParams: () => new URLSearchParams(navigation.searchParams)
}));

const model: ChartModel<"score" | "volume"> = {
  id: "quality-trend",
  title: "Динамика качества",
  description: "Средняя оценка и число завершённых проверок по дням.",
  xLabel: "Дата",
  yLabel: "Значение",
  series: [
    {
      key: "score",
      label: "Оценка",
      unit: "quality-score",
      tone: "primary"
    },
    {
      key: "volume",
      label: "Проверки",
      unit: "count",
      tone: "secondary"
    }
  ],
  points: [
    {
      id: "2026-07-01",
      label: "1 июля",
      sortKey: "2026-07-01",
      values: { score: 82.5, volume: 0 },
      sampleSize: 4
    },
    {
      id: "2026-07-02",
      label: "2 июля",
      sortKey: "2026-07-02",
      values: { score: null, volume: 12 },
      sampleSize: 12
    }
  ],
  emptyTitle: "Нет завершённых проверок",
  emptyDescription: "Данные появятся после первой финализированной проверки."
};

const currentHref =
  "/reports?view=overview&period=custom&start=2026-07-01&end=2026-07-31&team=enterprise&chartView=graph";

function renderFrame(
  overrides: Partial<React.ComponentProps<typeof ChartFrame>> = {}
) {
  return render(
    <ChartFrame
      model={model}
      view="table"
      currentHref={currentHref}
      periodLabel="1–31 июля 2026"
      sample={{ size: 16 }}
      {...overrides}
    />
  );
}

describe("ChartFrame", () => {
  beforeEach(() => {
    navigation.pathname = "/reports";
    navigation.searchParams =
      "view=overview&period=custom&start=2026-07-01&end=2026-07-31&team=enterprise&chartView=graph";
    navigation.refresh.mockReset();
    window.history.replaceState(null, "", currentHref);
  });

  it("renders the complete semantic table in model order", () => {
    renderFrame();

    const table = screen.getByRole("table", {
      name: "Табличные данные: Динамика качества"
    });
    const rows = within(table).getAllByRole("row");

    expect(within(rows[0]).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Дата",
      "Оценка, баллы качества",
      "Проверки, количество",
      "Выборка, количество"
    ]);
    expect(within(rows[1]).getByRole("rowheader")).toHaveTextContent("1 июля");
    expect(within(rows[1]).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "82,5",
      "0",
      "4"
    ]);
    expect(within(rows[2]).getByRole("rowheader")).toHaveTextContent("2 июля");
    expect(within(rows[2]).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "Нет данных",
      "12",
      "12"
    ]);
  });

  it("owns table overflow in one named focusable scroll region", () => {
    renderFrame();

    const region = screen.getByRole("region", {
      name: "Табличные данные: Динамика качества"
    });
    const table = within(region).getByRole("table", {
      name: "Табличные данные: Динамика качества"
    });

    expect(region).toHaveAttribute("data-slot", "chart-data-table-scroll-region");
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region).toHaveClass(
      "overflow-x-auto",
      "[&>[data-slot=table-container]]:overflow-visible"
    );
    expect(table).toHaveClass("min-w-max");
  });

  it("keeps report filters in Graph/Table hrefs and declares replace navigation", () => {
    renderFrame();

    expect(screen.getByRole("link", { name: "График" })).toHaveAttribute(
      "href",
      "/reports?view=overview&period=custom&start=2026-07-01&end=2026-07-31&team=enterprise&chartView=graph"
    );
    expect(screen.getByRole("link", { name: "Таблица" })).toHaveAttribute(
      "href",
      "/reports?view=overview&period=custom&start=2026-07-01&end=2026-07-31&team=enterprise&chartView=table"
    );
    expect(chartViewLinkProps(currentHref, "table")).toEqual({
      href: "/reports?view=overview&period=custom&start=2026-07-01&end=2026-07-31&team=enterprise&chartView=table",
      replace: true
    });
  });

  it("commits chart mode from trusted event-time URL before refreshing report data", () => {
    const liveHref =
      "/reports?view=overview&period=vk-current&compare=none&grain=day&chartView=graph&series=score%2Cvolume";
    window.history.replaceState(null, "", liveHref);
    navigation.searchParams =
      "view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score%2Cvolume";
    const replaceState = vi.spyOn(window.history, "replaceState");
    renderFrame({
      view: "graph",
      currentHref:
        "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score%2Cvolume"
    });

    const tableLink = screen.getByRole("link", { name: "Таблица" });
    expect(tableLink).toHaveAttribute(
      "href",
      "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=table&series=score%2Cvolume"
    );
    fireEvent.click(tableLink);

    expect(replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/reports?view=overview&period=vk-current&compare=none&grain=day&chartView=table&series=score%2Cvolume"
    );
    expect(window.location.href).toBe(
      "http://localhost:3000/reports?view=overview&period=vk-current&compare=none&grain=day&chartView=table&series=score%2Cvolume"
    );
    expect(navigation.refresh).toHaveBeenCalledOnce();
    expect(replaceState.mock.invocationCallOrder[0]).toBeLessThan(
      navigation.refresh.mock.invocationCallOrder[0]
    );
    replaceState.mockRestore();
  });

  it("does not propagate unknown or duplicate event-time query parameters", () => {
    window.history.replaceState(
      {},
      "",
      "/reports?view=overview&period=vk-current&compare=none&compare=year&grain=day&chartView=graph&series=score%2Cvolume&unknown=unsafe"
    );
    const replaceState = vi.spyOn(window.history, "replaceState");
    renderFrame({
      view: "graph",
      currentHref:
        "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score%2Cvolume"
    });

    fireEvent.click(screen.getByRole("link", { name: "Таблица" }));

    expect(replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=table&series=score%2Cvolume"
    );
    expect(navigation.refresh).toHaveBeenCalledOnce();
    replaceState.mockRestore();
  });

  it("renders href and active chart mode from validated Back and Forward hook state", () => {
    const serverHref =
      "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score%2Cvolume";
    const forwardHref =
      "/reports?view=overview&period=vk-current&compare=none&grain=day&chartView=table&series=score%2Cvolume";
    navigation.searchParams = forwardHref.slice("/reports?".length);
    window.history.replaceState(null, "", forwardHref);

    const view = renderFrame({
      view: "graph",
      currentHref: serverHref
    });

    expect(screen.getByRole("link", { name: "Таблица" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: "График" })).toHaveAttribute(
      "href",
      "/reports?view=overview&period=vk-current&compare=none&grain=day&chartView=graph&series=score%2Cvolume"
    );

    navigation.searchParams = serverHref.slice("/reports?".length);
    window.history.replaceState(null, "", serverHref);
    view.rerender(
      <ChartFrame
        model={model}
        view="graph"
        currentHref={serverHref}
        periodLabel="1–31 июля 2026"
        sample={{ size: 16 }}
      />
    );

    expect(screen.getByRole("link", { name: "График" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: "Таблица" })).toHaveAttribute(
      "href",
      "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=table&series=score%2Cvolume"
    );
  });

  it("falls back to canonical server href for malformed hook state with exactly one active mode", () => {
    const serverHref =
      "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score%2Cvolume";
    const scenarios = [
      {
        pathname: "/reports",
        search:
          "view=overview&period=vk-current&compare=none&grain=day&chartView=table&chartView=graph&series=score%2Cvolume"
      },
      {
        pathname: "/reports",
        search:
          "view=overview&period=vk-current&compare=none&grain=day&chartView=table&series=score%2Cvolume&unknown=unsafe"
      },
      {
        pathname: "/reports",
        search:
          "view=overview&period=vk-current&compare=none&grain=day&chartView=pie&series=score%2Cvolume"
      },
      {
        pathname: "/reviews",
        search:
          "view=overview&period=vk-current&compare=none&grain=day&chartView=table&series=score%2Cvolume"
      }
    ];
    navigation.pathname = scenarios[0].pathname;
    navigation.searchParams = scenarios[0].search;
    const view = renderFrame({ view: "graph", currentHref: serverHref });

    for (const scenario of scenarios) {
      navigation.pathname = scenario.pathname;
      navigation.searchParams = scenario.search;
      view.rerender(
        <ChartFrame
          model={model}
          view="graph"
          currentHref={serverHref}
          periodLabel="1–31 июля 2026"
          sample={{ size: 16 }}
        />
      );

      const graphLink = screen.getByRole("link", { name: "График" });
      const tableLink = screen.getByRole("link", { name: "Таблица" });
      expect(graphLink).toHaveAttribute("aria-current", "page");
      expect(tableLink).not.toHaveAttribute("aria-current");
      expect(graphLink).toHaveAttribute("href", serverHref);
      expect(tableLink).toHaveAttribute(
        "href",
        "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=table&series=score%2Cvolume"
      );
      expect(
        [graphLink, tableLink].filter(
          (link) => link.getAttribute("aria-current") === "page"
        )
      ).toHaveLength(1);
    }
  });

  it("leaves modified, targeted, downloaded, and prevented link activations to the browser", () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    const preventNativeNavigation = (event: Event) => event.preventDefault();
    document.addEventListener("click", preventNativeNavigation);
    try {
      renderFrame({ view: "graph" });
      const tableLink = screen.getByRole("link", { name: "Таблица" });

      for (const init of [
        { ctrlKey: true },
        { metaKey: true },
        { shiftKey: true },
        { altKey: true },
        { button: 1 }
      ]) {
        fireEvent.click(tableLink, init);
      }

      tableLink.setAttribute("target", "_blank");
      fireEvent.click(tableLink);
      tableLink.removeAttribute("target");

      tableLink.setAttribute("download", "report.csv");
      fireEvent.click(tableLink);
      tableLink.removeAttribute("download");

      tableLink.addEventListener("click", preventNativeNavigation, {
        once: true
      });
      fireEvent.click(tableLink);

      expect(replaceState).not.toHaveBeenCalled();
      expect(navigation.refresh).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("click", preventNativeNavigation);
      replaceState.mockRestore();
    }
  });

  it("shows the heading, description, period, units, and sample", () => {
    renderFrame();

    expect(screen.getByRole("heading", { name: "Динамика качества" })).toBeInTheDocument();
    expect(
      screen.getByText("Средняя оценка и число завершённых проверок по дням.")
    ).toBeInTheDocument();
    expect(screen.getByText("Период: 1–31 июля 2026")).toBeInTheDocument();
    expect(screen.getByText("Единицы: баллы качества, количество")).toBeInTheDocument();
    expect(screen.getByText("Выборка: 16")).toBeInTheDocument();
  });

  it("renders a reason and next step for an empty result", () => {
    renderFrame({
      state: {
        kind: "empty",
        action: {
          label: "Открыть очередь проверок",
          href: "/reviews?status=finalized"
        }
      }
    });

    expect(screen.getByText("Нет завершённых проверок")).toBeInTheDocument();
    expect(
      screen.getByText("Данные появятся после первой финализированной проверки.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Открыть очередь проверок" })).toHaveAttribute(
      "href",
      "/reviews?status=finalized"
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders a compact error with a retry action", () => {
    renderFrame({
      state: {
        kind: "error",
        message: "Не удалось получить агрегированные данные.",
        retryHref: currentHref
      }
    });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Не удалось загрузить данные");
    expect(alert).toHaveTextContent("Не удалось получить агрегированные данные.");
    expect(within(alert).getByRole("link", { name: "Повторить" })).toHaveAttribute(
      "href",
      currentHref
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("keeps loading geometry and exposes a non-animated status label", () => {
    renderFrame({ state: { kind: "loading" } });

    expect(screen.getByRole("status")).toHaveAccessibleName("Загрузка данных графика");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it.each([
    ["loading", { kind: "loading" } as const],
    ["ready", { kind: "ready" } as const],
    ["empty", { kind: "empty" } as const],
    [
      "error",
      {
        kind: "error",
        message: "Не удалось получить агрегированные данные."
      } as const
    ]
  ])("preserves the common content geometry in the %s state", (_label, state) => {
    const { container } = renderFrame({ state });

    expect(container.querySelector('[data-slot="chart-frame-content"]')).toHaveClass(
      "min-h-60"
    );
  });

  it("shows low-sample and stale-comparison context while preserving missing points", () => {
    renderFrame({
      sample: { size: 4, minimum: 10 },
      comparison: {
        status: "stale",
        asOf: "30 июня 2026"
      }
    });

    expect(screen.getByText("Недостаточно выборки: 4 из 10")).toBeInTheDocument();
    expect(screen.getByText("База сравнения устарела: 30 июня 2026")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Нет данных" })).toBeInTheDocument();
  });

  it("renders only the active graph representation", () => {
    renderFrame({
      view: "graph",
      graph: <div role="img" aria-label="График динамики качества" />
    });

    expect(screen.getByRole("img", { name: "График динамики качества" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
