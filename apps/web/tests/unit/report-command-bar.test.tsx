import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ReportParameterLens,
  reportLocationNavigation
} from "@/components/reports/report-parameter-lens";

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  searchParams: ""
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: navigation.push,
    replace: navigation.replace,
    refresh: navigation.refresh
  }),
  useSearchParams: () => new URLSearchParams(navigation.searchParams)
}));

afterEach(() => {
  vi.unstubAllGlobals();
  navigation.searchParams = "";
});

describe("ReportParameterLens", () => {
  it("observes material history traversal after Next without preempting it", () => {
    const source = readFileSync(
      `${process.cwd()}/src/components/reports/report-parameter-lens.tsx`,
      "utf8"
    );

    expect(source).toContain(
      'window.addEventListener("popstate", reloadMaterialPopstate);'
    );
    expect(source).toContain(
      'window.removeEventListener("popstate", reloadMaterialPopstate);'
    );
    expect(source).toContain("reportLocationNavigation.reload();");
    expect(source).not.toContain("stopImmediatePropagation");
    expect(source).not.toContain("pendingPopstate");
    expect(source).not.toContain("popstateNavigationTimer");
  });

  it("keeps one named lens region with core parameters, one filter trigger, and at most three active chips", () => {
    navigation.searchParams =
      "view=performance&period=vk-current&compare=previous&grain=week&team=declining-team-0123456789&source=freshdesk&risk=high_plus&block=processes-aabbccddee&section=ai-drift&chartView=graph&series=score";
    render(
      <ReportParameterLens
        currentHref="/reports?view=performance&period=vk-current&compare=previous&grain=week&team=declining-team-0123456789&source=freshdesk&risk=high_plus&block=processes-aabbccddee&section=ai-drift&chartView=graph&series=score"
        state={{
          view: "performance",
          period: "vk-current",
          compare: "previous",
          grain: "week",
          team: "declining-team-0123456789",
          source: "freshdesk",
          risk: "high_plus",
          block: "processes-aabbccddee",
          section: "ai-drift",
          chartView: "graph",
          series: ["score"]
        }}
        catalog={{
          teams: [{ slug: "declining-team-0123456789", value: "2ЛП — снижение" }],
          sources: ["freshdesk"],
          blocks: [{ slug: "processes-aabbccddee", value: "Процессы" }]
        }}
        savedViews={[]}
      />
    );

    const lens = screen.getByRole("region", { name: "Параметры отчёта" });
    expect(within(lens).getByLabelText("Период")).toHaveValue("vk-current");
    expect(within(lens).getByLabelText("Сравнение")).toHaveValue("previous");
    expect(within(lens).getByLabelText("Шаг")).toHaveValue("week");
    expect(within(lens).getByRole("button", { name: "Фильтры (4)" })).toBeInTheDocument();
    expect(within(lens).getByRole("button", { name: /Сохранённый вид/ })).toBeInTheDocument();
    expect(within(lens).getAllByTestId("active-report-filter-chip")).toHaveLength(3);
    expect(within(lens).getByText("Ещё 1")).toBeInTheDocument();
    expect(lens.closest('[data-slot="card"]')).toBeNull();
    expect(lens).toHaveClass(
      "h-14",
      "w-full",
      "max-w-full",
      "min-w-0",
      "flex-row",
      "items-center",
      "py-1",
      "min-[641px]:max-h-14",
      "min-[641px]:flex-row",
      "min-[641px]:items-center",
      "[@media(min-width:1024px)_and_(min-height:700px)]:sticky",
      "[@media(min-width:1024px)_and_(min-height:700px)]:top-(--app-topbar-height)",
      "[@media(min-width:1024px)_and_(min-height:700px)]:z-10"
    );
    expect(lens).not.toHaveClass(
      "flex-col",
      "overflow-hidden",
      "overflow-x-auto",
      "overflow-x-hidden",
      "py-2",
      "lg:max-h-14",
      "lg:flex-row"
    );

    const parameterRail = lens.querySelector('form[action="/reports"]');
    const actionRail = lens.children.item(1);
    const chipRail = within(lens)
      .getAllByTestId("active-report-filter-chip")[0]
      .parentElement;

    expect(parameterRail).toHaveClass(
      "relative",
      "w-0",
      "max-w-full",
      "min-w-0",
      "flex-1",
      "overflow-x-auto"
    );
    expect(actionRail).toHaveClass(
      "w-0",
      "max-w-full",
      "min-w-0",
      "flex-1",
      "overflow-x-auto",
      "min-[641px]:w-auto",
      "min-[641px]:flex-none"
    );
    expect(chipRail).toHaveClass(
      "w-0",
      "max-w-full",
      "min-w-0",
      "flex-1",
      "overflow-x-auto"
    );
  });

  it("keeps compact select fields wide enough for their full labels", () => {
    render(
      <ReportParameterLens
        currentHref="/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score"
        state={{
          view: "overview",
          period: "vk-current",
          compare: "previous",
          grain: "day",
          chartView: "graph",
          series: ["score"]
        }}
        catalog={{ teams: [], sources: [], blocks: [] }}
        savedViews={[]}
      />
    );

    const periodField = screen
      .getByLabelText("Период")
      .closest('[data-slot="field"]');
    const compareField = screen
      .getByLabelText("Сравнение")
      .closest('[data-slot="field"]');
    const grainField = screen
      .getByLabelText("Шаг")
      .closest('[data-slot="field"]');

    expect(periodField).toHaveClass("min-w-40");
    expect(compareField).toHaveClass("min-w-40");
    expect(grainField).toHaveClass("min-w-30");

    expect(
      screen.getByRole("option", { name: "Текущий 22–21" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Прошлый период" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "По неделям" })
    ).toBeInTheDocument();
  });

  it("keeps server-rendered controls enabled while exposing client readiness", async () => {
    const props = {
      currentHref:
        "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score",
      state: {
        view: "overview" as const,
        period: "vk-current",
        compare: "previous" as const,
        grain: "day" as const,
        chartView: "graph" as const,
        series: ["score" as const]
      },
      catalog: { teams: [], sources: [], blocks: [] },
      savedViews: []
    };
    const serverContainer = document.createElement("div");
    serverContainer.innerHTML = renderToStaticMarkup(
      <ReportParameterLens {...props} />
    );

    const serverLens = within(serverContainer).getByRole("region", {
      name: "Параметры отчёта"
    });
    expect(serverLens).toHaveAttribute("data-hydrated", "false");
    expect(within(serverLens).getByLabelText("Период")).toHaveValue("vk-current");
    expect(within(serverLens).getByLabelText("Сравнение")).toHaveValue(
      "previous"
    );
    expect(within(serverLens).getByLabelText("Шаг")).toHaveValue("day");
    for (const label of ["Период", "Сравнение", "Шаг"]) {
      expect(within(serverLens).getByLabelText(label)).toBeEnabled();
    }

    render(<ReportParameterLens {...props} />);
    const clientLens = screen.getByRole("region", {
      name: "Параметры отчёта"
    });
    await waitFor(() =>
      expect(clientLens).toHaveAttribute("data-hydrated", "true")
    );
    for (const label of ["Период", "Сравнение", "Шаг"]) {
      expect(within(clientLens).getByLabelText(label)).toBeEnabled();
    }
  });

  it("commits filter history before refreshing server report data", () => {
    navigation.push.mockReset();
    navigation.refresh.mockReset();
    const pushState = vi.spyOn(window.history, "pushState");
    const validEvidenceKey =
      "ev1_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    navigation.searchParams =
      `view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score&evidenceType=trend&evidenceKey=${validEvidenceKey}`;
    window.history.replaceState(
      null,
      "",
      `/reports?${navigation.searchParams}`
    );
    const { container } = render(
      <ReportParameterLens
        currentHref={`/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score&evidenceType=trend&evidenceKey=${validEvidenceKey}`}
        state={{
          view: "overview",
          period: "vk-current",
          compare: "previous",
          grain: "day",
          chartView: "graph",
          series: ["score"],
          evidenceType: "trend",
          evidenceKey: validEvidenceKey
        }}
        catalog={{ teams: [], sources: [], blocks: [] }}
        savedViews={[]}
      />
    );

    fireEvent.change(within(container).getByLabelText("Сравнение"), {
      target: { value: "none" }
    });
    expect(pushState).toHaveBeenCalledWith(
      null,
      "",
      "/reports?view=overview&period=vk-current&compare=none&grain=day&chartView=graph&series=score"
    );
    expect(navigation.refresh).toHaveBeenCalledOnce();
    expect(pushState.mock.invocationCallOrder[0]).toBeLessThan(
      navigation.refresh.mock.invocationCallOrder[0]
    );
    expect(navigation.push).not.toHaveBeenCalled();
    pushState.mockRestore();
  });

  it("follows hook-derived live URL state without navigation side effects", () => {
    navigation.replace.mockReset();
    navigation.refresh.mockReset();
    navigation.searchParams =
      "view=overview&period=vk-current&compare=none&grain=day&chartView=graph&series=score";
    const props = {
      currentHref:
        "/reports?view=overview&period=vk-current&compare=none&grain=day&chartView=graph&series=score",
      state: {
        view: "overview" as const,
        period: "vk-current",
        compare: "none" as const,
        grain: "day" as const,
        chartView: "graph" as const,
        series: ["score" as const]
      },
      catalog: { teams: [], sources: [], blocks: [] },
      savedViews: []
    };
    const { rerender } = render(<ReportParameterLens {...props} />);
    expect(screen.getByLabelText("Сравнение")).toHaveValue("none");

    const targetSearch =
      "view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score";
    navigation.searchParams = targetSearch;
    rerender(<ReportParameterLens {...props} />);

    expect(screen.getByLabelText("Сравнение")).toHaveValue("previous");
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it("reloads a material popstate when hook controls already show the target but the server body is stale", () => {
    navigation.replace.mockReset();
    navigation.refresh.mockReset();
    const reload = vi
      .spyOn(reportLocationNavigation, "reload")
      .mockImplementation(() => {});
    const initialSearch =
      "view=overview&period=vk-current&compare=none&grain=day&chartView=table&series=score";
    const evidenceKey =
      "ev1_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const targetSearch =
      `view=performance&period=vk-current&compare=previous&grain=week&chartView=graph&series=score%2Cvolume&evidenceType=trend&evidenceKey=${evidenceKey}`;
    navigation.searchParams = targetSearch;
    window.history.replaceState(null, "", `/reports?${initialSearch}`);
    render(
      <ReportParameterLens
        currentHref={`/reports?${initialSearch}`}
        state={{
          view: "overview",
          period: "vk-current",
          compare: "none",
          grain: "day",
          chartView: "table",
          series: ["score"]
        }}
        catalog={{ teams: [], sources: [], blocks: [] }}
        savedViews={[]}
      />
    );
    expect(screen.getByLabelText("Сравнение")).toHaveValue("previous");
    expect(screen.getByLabelText("Шаг")).toHaveValue("week");

    window.history.replaceState(
      null,
      "",
      `/reports?series=volume%2Cscore&chartView=graph&grain=week&compare=previous&period=vk-current&view=performance&evidenceType=trend&evidenceKey=${evidenceKey}#criterion-17`
    );
    const event = new PopStateEvent("popstate", { state: { __NA: true } });
    const stopImmediatePropagation = vi.spyOn(event, "stopImmediatePropagation");
    const pushState = vi.spyOn(window.history, "pushState");
    const replaceState = vi.spyOn(window.history, "replaceState");

    window.dispatchEvent(event);

    expect(stopImmediatePropagation).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledOnce();
    expect(window.location.hash).toBe("#criterion-17");
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(navigation.refresh).not.toHaveBeenCalled();
    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
    reload.mockRestore();
    pushState.mockRestore();
    replaceState.mockRestore();
  });

  it("passes evidence-only and hash-only popstate through untouched", () => {
    navigation.replace.mockReset();
    navigation.refresh.mockReset();
    const reload = vi
      .spyOn(reportLocationNavigation, "reload")
      .mockImplementation(() => {});
    const initialSearch =
      "view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score";
    navigation.searchParams = initialSearch;
    window.history.replaceState(null, "", `/reports?${initialSearch}`);
    render(
      <ReportParameterLens
        currentHref={`/reports?${initialSearch}`}
        state={{
          view: "overview",
          period: "vk-current",
          compare: "previous",
          grain: "day",
          chartView: "graph",
          series: ["score"]
        }}
        catalog={{ teams: [], sources: [], blocks: [] }}
        savedViews={[]}
      />
    );

    const evidenceKey =
      "ev1_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
    window.history.replaceState(
      null,
      "",
      `/reports?${initialSearch}&evidenceType=trend&evidenceKey=${evidenceKey}`
    );
    const evidenceEvent = new PopStateEvent("popstate", {
      state: { __NA: true }
    });
    const stopEvidence = vi.spyOn(evidenceEvent, "stopImmediatePropagation");
    window.dispatchEvent(evidenceEvent);

    window.history.replaceState(null, "", `/reports?${initialSearch}#history`);
    const hashEvent = new PopStateEvent("popstate", {
      state: { __NA: true }
    });
    const stopHash = vi.spyOn(hashEvent, "stopImmediatePropagation");
    window.dispatchEvent(hashEvent);

    expect(stopEvidence).not.toHaveBeenCalled();
    expect(stopHash).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(navigation.refresh).not.toHaveBeenCalled();
    reload.mockRestore();
  });

  it("passes null and foreign history entries through untouched", () => {
    navigation.replace.mockReset();
    navigation.refresh.mockReset();
    const reload = vi
      .spyOn(reportLocationNavigation, "reload")
      .mockImplementation(() => {});
    const initialSearch =
      "view=overview&period=vk-current&compare=none&grain=day&chartView=table&series=score";
    navigation.searchParams = initialSearch;
    window.history.replaceState(null, "", `/reports?${initialSearch}`);
    render(
      <ReportParameterLens
        currentHref={`/reports?${initialSearch}`}
        state={{
          view: "overview",
          period: "vk-current",
          compare: "none",
          grain: "day",
          chartView: "table",
          series: ["score"]
        }}
        catalog={{ teams: [], sources: [], blocks: [] }}
        savedViews={[]}
      />
    );

    window.history.replaceState(
      null,
      "",
      "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score"
    );
    const nullEvent = new PopStateEvent("popstate", { state: null });
    const stopNull = vi.spyOn(nullEvent, "stopImmediatePropagation");
    window.dispatchEvent(nullEvent);
    const foreignEvent = new PopStateEvent("popstate", {
      state: { __NA: false, owner: "foreign" }
    });
    const stopForeign = vi.spyOn(foreignEvent, "stopImmediatePropagation");
    window.dispatchEvent(foreignEvent);

    expect(stopNull).not.toHaveBeenCalled();
    expect(stopForeign).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(navigation.refresh).not.toHaveBeenCalled();
    reload.mockRestore();
  });

  it("reloads a malformed Next-owned reports entry deterministically", () => {
    navigation.replace.mockReset();
    navigation.refresh.mockReset();
    const reload = vi
      .spyOn(reportLocationNavigation, "reload")
      .mockImplementation(() => {});
    const initialSearch =
      "view=overview&period=vk-current&compare=none&grain=day&chartView=table&series=score";
    navigation.searchParams = initialSearch;
    window.history.replaceState(null, "", `/reports?${initialSearch}`);
    render(
      <ReportParameterLens
        currentHref={`/reports?${initialSearch}`}
        state={{
          view: "overview",
          period: "vk-current",
          compare: "none",
          grain: "day",
          chartView: "table",
          series: ["score"]
        }}
        catalog={{ teams: [], sources: [], blocks: [] }}
        savedViews={[]}
      />
    );

    window.history.replaceState(
      null,
      "",
      "/reports?view=overview&view=process&period=vk-current"
    );
    window.dispatchEvent(
      new PopStateEvent("popstate", { state: { __NA: true } })
    );

    expect(reload).toHaveBeenCalledOnce();
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(navigation.refresh).not.toHaveBeenCalled();
    reload.mockRestore();
  });

  it("keeps exactly one material popstate reload observer in Strict Mode and removes it", () => {
    navigation.replace.mockReset();
    navigation.refresh.mockReset();
    const reload = vi
      .spyOn(reportLocationNavigation, "reload")
      .mockImplementation(() => {});
    const addEventListener = vi.spyOn(window, "addEventListener");
    const removeEventListener = vi.spyOn(window, "removeEventListener");
    const initialSearch =
      "view=overview&period=vk-current&compare=none&grain=day&chartView=table&series=score";
    navigation.searchParams = initialSearch;
    window.history.replaceState(null, "", `/reports?${initialSearch}`);
    const props = {
      currentHref: `/reports?${initialSearch}`,
      state: {
        view: "overview" as const,
        period: "vk-current",
        compare: "none" as const,
        grain: "day" as const,
        chartView: "table" as const,
        series: ["score" as const]
      },
      catalog: { teams: [], sources: [], blocks: [] },
      savedViews: []
    };
    const view = render(
      <React.StrictMode>
        <ReportParameterLens {...props} />
      </React.StrictMode>
    );

    const targetSearch =
      "view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score";
    window.history.replaceState(null, "", `/reports?${targetSearch}`);
    window.dispatchEvent(
      new PopStateEvent("popstate", { state: { __NA: true } })
    );
    expect(reload).toHaveBeenCalledOnce();
    expect(navigation.replace).not.toHaveBeenCalled();

    view.unmount();
    reload.mockReset();
    window.history.replaceState(
      null,
      "",
      "/reports?view=overview&period=vk-current&compare=year&grain=week&chartView=graph&series=score"
    );
    window.dispatchEvent(
      new PopStateEvent("popstate", { state: { __NA: true } })
    );

    const popstateAdds = addEventListener.mock.calls.filter(
      ([type, listener, options]) =>
        type === "popstate" &&
        options === undefined &&
        typeof listener === "function" &&
        listener.name === "reloadMaterialPopstate"
    );
    const popstateRemoves = removeEventListener.mock.calls.filter(
      ([type, listener, options]) =>
        type === "popstate" &&
        options === undefined &&
        typeof listener === "function" &&
        listener.name === "reloadMaterialPopstate"
    );
    expect(popstateAdds.length).toBeGreaterThanOrEqual(2);
    expect(popstateRemoves).toHaveLength(popstateAdds.length);
    expect(reload).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(navigation.refresh).not.toHaveBeenCalled();
    reload.mockRestore();
    addEventListener.mockRestore();
    removeEventListener.mockRestore();
  });

  it("uses canonical defaults after popstate reaches bare reports URL", () => {
    navigation.replace.mockReset();
    navigation.refresh.mockReset();
    const reload = vi
      .spyOn(reportLocationNavigation, "reload")
      .mockImplementation(() => {});
    navigation.searchParams =
      "view=details&period=quarter-current&compare=none&grain=week&team=alpha-team&chartView=graph&series=score";
    const props = {
      currentHref:
        "/reports?view=details&period=quarter-current&compare=none&grain=week&team=alpha-team&chartView=graph&series=score",
      state: {
        view: "details" as const,
        period: "quarter-current",
        compare: "none" as const,
        grain: "week" as const,
        team: "alpha-team",
        chartView: "graph" as const,
        series: ["score" as const]
      },
      catalog: {
        teams: [{ slug: "alpha-team", value: "Команда Alpha" }],
        sources: [],
        blocks: []
      },
      savedViews: []
    };
    const { rerender } = render(<ReportParameterLens {...props} />);
    expect(screen.getByLabelText("Сравнение")).toHaveValue("none");
    expect(screen.getByLabelText("Шаг")).toHaveValue("week");
    expect(screen.getByRole("button", { name: "Фильтры (1)" })).toBeVisible();

    window.history.replaceState(null, "", "/reports");
    window.dispatchEvent(
      new PopStateEvent("popstate", { state: { __NA: true } })
    );
    expect(reload).toHaveBeenCalledOnce();
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(navigation.refresh).not.toHaveBeenCalled();
    navigation.searchParams = "";
    rerender(<ReportParameterLens {...props} />);

    expect(screen.getByLabelText("Период")).toHaveValue("vk-current");
    expect(screen.getByLabelText("Сравнение")).toHaveValue("previous");
    expect(screen.getByLabelText("Шаг")).toHaveValue("day");
    expect(screen.getByRole("button", { name: "Фильтры (0)" })).toBeVisible();
    expect(
      screen.queryByTestId("active-report-filter-chip")
    ).not.toBeInTheDocument();
    expect(reload).toHaveBeenCalledOnce();
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(navigation.refresh).not.toHaveBeenCalled();
    reload.mockRestore();
  });

  it("keeps saved-view identity stable while evidence is open", () => {
    const validEvidenceKey =
      "ev1_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const savedHref =
      "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score";
    navigation.searchParams =
      `view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score&evidenceType=trend&evidenceKey=${validEvidenceKey}`;

    render(
      <ReportParameterLens
        currentHref={`${savedHref}&evidenceType=trend&evidenceKey=${validEvidenceKey}`}
        state={{
          view: "overview",
          period: "vk-current",
          compare: "previous",
          grain: "day",
          chartView: "graph",
          series: ["score"],
          evidenceType: "trend",
          evidenceKey: validEvidenceKey
        }}
        catalog={{ teams: [], sources: [], blocks: [] }}
        savedViews={[
          {
            id: "saved-1",
            name: "Мой обзор",
            href: savedHref,
            scope: "private"
          }
        ]}
      />
    );

    expect(
      screen.getByRole("button", { name: "Сохранённый вид: Мой обзор" })
    ).toBeVisible();
  });

  it("uses a traversed event-time URL for one direct filter navigation", () => {
    navigation.replace.mockReset();
    navigation.refresh.mockReset();
    const initialSearch =
      "view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score";
    const popstateTargetSearch =
      "view=overview&period=vk-current&compare=none&grain=day&chartView=table&series=score";
    navigation.searchParams = initialSearch;
    window.history.replaceState(null, "", `/reports?${initialSearch}`);
    const props = {
      currentHref: `/reports?${initialSearch}`,
      state: {
        view: "overview" as const,
        period: "vk-current",
        compare: "previous" as const,
        grain: "day" as const,
        chartView: "graph" as const,
        series: ["score" as const]
      },
      catalog: { teams: [], sources: [], blocks: [] },
      savedViews: []
    };
    render(<ReportParameterLens {...props} />);

    window.history.replaceState(
      null,
      "",
      `/reports?${popstateTargetSearch}`
    );
    expect(navigation.refresh).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();

    const pushState = vi.spyOn(window.history, "pushState");
    fireEvent.change(screen.getByLabelText("Сравнение"), {
      target: { value: "year" }
    });

    expect(pushState).toHaveBeenCalledWith(
      null,
      "",
      "/reports?view=overview&period=vk-current&compare=year&grain=day&chartView=table&series=score"
    );
    expect(navigation.refresh).toHaveBeenCalledOnce();
    expect(navigation.replace).not.toHaveBeenCalled();
    pushState.mockRestore();
  });

  it("keeps custom dates controlled across rerenders without Base UI diagnostics", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }))
    );
    const diagnostics: string[] = [];
    const errorSpy = vi.spyOn(console, "error").mockImplementation((...args) => {
      diagnostics.push(args.map(String).join(" "));
    });
    const initialState = {
      view: "overview" as const,
      period: "custom",
      start: "2026-07-01",
      end: "2026-07-24",
      compare: "previous" as const,
      grain: "day" as const,
      chartView: "graph" as const,
      series: ["score" as const]
    };
    navigation.searchParams =
      "view=overview&period=custom&start=2026-07-01&end=2026-07-24&compare=previous&grain=day&chartView=graph&series=score";
    const { rerender } = render(
      <ReportParameterLens
        currentHref="/reports?view=overview&period=custom&start=2026-07-01&end=2026-07-24&compare=previous&grain=day&chartView=graph&series=score"
        state={initialState}
        catalog={{ teams: [], sources: ["freshdesk"], blocks: [] }}
        savedViews={[]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Фильтры (0)" }));
    const filters = await screen.findByRole("dialog", { name: "Фильтры отчёта" });
    expect(within(filters).getByLabelText("Источник")).toHaveValue("");
    expect(within(filters).getByRole("option", { name: "Freshdesk" })).toHaveValue(
      "freshdesk"
    );
    expect(within(filters).getByLabelText("С даты")).toHaveValue("2026-07-01");
    expect(within(filters).getByLabelText("По дату")).toHaveValue("2026-07-24");

    navigation.searchParams =
      "view=overview&period=custom&start=2026-07-05&end=2026-07-20&compare=previous&grain=day&chartView=graph&series=score";
    rerender(
      <ReportParameterLens
        currentHref="/reports?view=overview&period=custom&start=2026-07-05&end=2026-07-20&compare=previous&grain=day&chartView=graph&series=score"
        state={{ ...initialState, start: "2026-07-05", end: "2026-07-20" }}
        catalog={{ teams: [], sources: ["freshdesk"], blocks: [] }}
        savedViews={[]}
      />
    );
    await waitFor(() => {
      expect(within(filters).getByLabelText("С даты")).toHaveValue("2026-07-05");
      expect(within(filters).getByLabelText("По дату")).toHaveValue("2026-07-20");
    });
    errorSpy.mockRestore();
    expect(diagnostics.filter((message) => /controlled|uncontrolled|FieldControl/i.test(message))).toEqual([]);
  });

  it("uses an exact-640-safe full-width, full-height shadcn Sheet for mobile filters", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }))
    );
    render(
      <ReportParameterLens
        currentHref="/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score"
        state={{
          view: "overview",
          period: "vk-current",
          compare: "previous",
          grain: "day",
          chartView: "graph",
          series: ["score"]
        }}
        catalog={{ teams: [], sources: [], blocks: [] }}
        savedViews={[]}
      />
    );

    const trigger = await screen.findByRole("button", { name: "Фильтры (0)" });
    fireEvent.click(trigger);
    const sheet = await screen.findByRole("dialog", { name: "Фильтры отчёта" });
    expect(sheet).toHaveClass(
      "data-[side=right]:w-full",
      "data-[side=right]:h-dvh",
      "data-[side=right]:sm:max-w-none"
    );
    expect(within(sheet).getByRole("button", { name: "Закрыть" })).toBeInTheDocument();
  });
});
