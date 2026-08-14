import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReportEvidenceSheet } from "@/components/reports/report-evidence-sheet";
import type { ReportEvidenceResult } from "@/lib/reports/report-evidence";

const navigation = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn()
};

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
  useSearchParams: () => new URLSearchParams(window.location.search)
}));

const evidenceKey = `ev1_${"A".repeat(43)}`;
const openHref =
  `/reports?view=overview&evidenceType=trend&evidenceKey=${evidenceKey}`;
const closeHref = "/reports?view=overview";
const alternateOpenHref =
  `/reports?view=overview&evidenceType=driver&evidenceKey=${`ev1_${"B".repeat(43)}`}`;
const resolvedEvidenceIdentity = `trend:${evidenceKey}`;
const alternateEvidenceIdentity = `driver:${`ev1_${"B".repeat(43)}`}`;

const readyEvidence: ReportEvidenceResult = {
  status: "ready",
  title: "Снижение средней оценки",
  description: "Связано с выбранным периодом и фильтрами.",
  comparison: "−3 балла к прошлому периоду",
  sample: "7 проверок в выборке",
  rows: [
    {
      id: "review-1",
      conversationId: "conversation-1",
      href:
        "/reviews/conversation-1?returnTo=%2Freports%3Fview%3Doverview",
      scoreLabel: "72 балла",
      sourceLabel: "Freshdesk",
      teamLabel: "2ЛП — снижение",
      finalizedAt: "2026-07-24T12:00:00.000Z",
      riskLabel: "Высокий риск",
      relationLabel: "Связано с выбранной выборкой"
    }
  ]
};

const alternateEvidence: ReportEvidenceResult = {
  ...readyEvidence,
  title: "Рост доли высокого риска",
  description: "Связано с другим выбранным фрагментом.",
  comparison: "+4 проверки к прошлому периоду",
  rows: [
    {
      ...readyEvidence.rows[0],
      id: "review-2",
      conversationId: "conversation-2",
      href:
        "/reviews/conversation-2?returnTo=%2Freports%3Fview%3Doverview"
    }
  ]
};

const unavailableEvidence: ReportEvidenceResult = {
  status: "unavailable",
  title: "Данные больше недоступны",
  description:
    "Выбранный фрагмент нельзя открыть. Обновите отчёт и попробуйте снова.",
  rows: []
};

function fixture(open: boolean, children?: React.ReactElement) {
  if (open) {
    window.history.replaceState(null, "", openHref);
  }
  return (
    <>
      <h2 id="quality-trend-title">
        Динамика качества
      </h2>
      <ReportEvidenceSheet
        evidence={readyEvidence}
        open={open}
        resolvedEvidenceIdentity={open ? resolvedEvidenceIdentity : null}
        openHref={openHref}
        closeHref={closeHref}
        chartHeadingId="quality-trend-title"
      >
        {children}
      </ReportEvidenceSheet>
    </>
  );
}

describe("ReportEvidenceSheet", () => {
  beforeEach(() => {
    navigation.push.mockReset();
    navigation.push.mockImplementation((href: string) => {
      window.history.replaceState(null, "", href);
    });
    navigation.replace.mockReset();
    navigation.refresh.mockReset();
    window.history.replaceState(null, "", closeHref);
    // Default: an on-demand evidence request that never settles, so fixtures
    // without a fetch assertion stay deterministic.
    vi.unstubAllGlobals();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {}))
    );
  });

  it("resolves a URL-carried evidence identity on demand and opens the fetched payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => readyEvidence
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState(null, "", openHref);
    render(
      <>
        <h2 id="quality-trend-title">Динамика качества</h2>
        <ReportEvidenceSheet
          evidence={unavailableEvidence}
          open={false}
          resolvedEvidenceIdentity={null}
          openHref={openHref}
          closeHref={closeHref}
          chartHeadingId="quality-trend-title"
        />
      </>
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/reports/evidence${window.location.search}`,
        expect.objectContaining({
          headers: expect.objectContaining({ accept: "application/json" })
        })
      );
    });
    const dialog = await screen.findByRole("dialog", {
      name: "Данные и примеры"
    });
    expect(
      within(dialog).getByText(readyEvidence.title)
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("link", { name: /Freshdesk/i })
    ).toHaveAttribute("href", readyEvidence.rows[0].href);
  });

  it("opens the generic unavailable state when the on-demand evidence request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );
    window.history.replaceState(null, "", openHref);
    render(
      <>
        <h2 id="quality-trend-title">Динамика качества</h2>
        <ReportEvidenceSheet
          evidence={readyEvidence}
          open={false}
          resolvedEvidenceIdentity={null}
          openHref={openHref}
          closeHref={closeHref}
          chartHeadingId="quality-trend-title"
        />
      </>
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Данные и примеры"
    });
    expect(
      within(dialog).getByText(unavailableEvidence.title)
    ).toBeInTheDocument();
  });

  it("uses one App Router push and keeps closed data hidden until server identity catches up", () => {
    render(
      <>
        <h2 id="quality-trend-title">Динамика качества</h2>
        <ReportEvidenceSheet
          evidence={unavailableEvidence}
          open={false}
          resolvedEvidenceIdentity={null}
          openHref={openHref}
          closeHref={closeHref}
          chartHeadingId="quality-trend-title"
        >
          <button type="button">Открыть после RSC</button>
        </ReportEvidenceSheet>
      </>
    );
    const trigger = screen.getByRole("button", {
      name: "Открыть после RSC"
    });
    trigger.focus();
    const nativePush = vi.spyOn(window.history, "pushState");

    fireEvent.click(trigger);

    expect(window.location.pathname + window.location.search).toBe(openHref);
    expect(navigation.push).toHaveBeenCalledWith(openHref, { scroll: false });
    expect(navigation.refresh).not.toHaveBeenCalled();
    expect(nativePush).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("dialog", { name: "Данные и примеры" })
    ).not.toBeInTheDocument();
    nativePush.mockRestore();
  });

  it("opens an exact server-resolved default payload locally without an RSC navigation", async () => {
    const view = render(
      <ReportEvidenceSheet
        evidence={unavailableEvidence}
        open={false}
        resolvedEvidenceIdentity={null}
        defaultEvidence={{
          identity: resolvedEvidenceIdentity,
          result: readyEvidence
        }}
        openHref={openHref}
        closeHref={closeHref}
        chartHeadingId="quality-trend-title"
      >
        <button type="button">Открыть готовые данные</button>
      </ReportEvidenceSheet>
    );
    const nativePush = vi.spyOn(window.history, "pushState");
    const trigger = screen.getByRole("button", {
      name: "Открыть готовые данные"
    });
    trigger.focus();
    fireEvent.click(trigger);

    expect(window.location.pathname + window.location.search).toBe(openHref);
    expect(navigation.push).not.toHaveBeenCalled();
    expect(nativePush).toHaveBeenCalledWith(null, "", openHref);
    // The Sheet reads the identity from the address bar; in the app the
    // router's native-history integration re-renders it, which the mocked
    // hooks emulate on the next render.
    view.rerender(
      <ReportEvidenceSheet
        evidence={unavailableEvidence}
        open={false}
        resolvedEvidenceIdentity={null}
        defaultEvidence={{
          identity: resolvedEvidenceIdentity,
          result: readyEvidence
        }}
        openHref={openHref}
        closeHref={closeHref}
        chartHeadingId="quality-trend-title"
      >
        <button type="button">Открыть готовые данные</button>
      </ReportEvidenceSheet>
    );
    expect(
      await screen.findByRole("dialog", { name: "Данные и примеры" })
    ).toBeVisible();
    expect(screen.getByText(readyEvidence.title)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(window.location.pathname + window.location.search).toBe(closeHref);
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Данные и примеры" })
      ).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });
    nativePush.mockRestore();
  });

  it("never renders payload A while the live URL carries identity B", () => {
    window.history.replaceState(null, "", alternateOpenHref);
    render(
      <ReportEvidenceSheet
        evidence={readyEvidence}
        open
        resolvedEvidenceIdentity={resolvedEvidenceIdentity}
        openHref={openHref}
        closeHref={closeHref}
        chartHeadingId="quality-trend-title"
      />
    );

    expect(
      screen.queryByRole("dialog", { name: "Данные и примеры" })
    ).not.toBeInTheDocument();
    expect(screen.queryByText(readyEvidence.title)).not.toBeInTheDocument();
  });

  it("uses App Router for open and a native history entry for local close", () => {
    const liveHref =
      "/reports?view=overview&period=vk-current&compare=none&grain=day&chartView=table&series=score%2Cvolume";
    const serverOpenHref =
      `${liveHref}&evidenceType=trend&evidenceKey=${evidenceKey}`;
    window.history.replaceState(
      { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: {} },
      "",
      liveHref
    );
    const view = render(
      <ReportEvidenceSheet
        evidence={readyEvidence}
        open={false}
        resolvedEvidenceIdentity={null}
        openHref={serverOpenHref}
        closeHref={liveHref}
        chartHeadingId="quality-trend-title"
      >
        <button type="button">Показать данные после Forward</button>
      </ReportEvidenceSheet>
    );

    const trigger = screen.getByRole("button", {
      name: "Показать данные после Forward"
    });
    trigger.focus();
    fireEvent.click(trigger);

    expect(window.location.pathname + window.location.search).toBe(serverOpenHref);
    expect(navigation.push).toHaveBeenCalledWith(serverOpenHref, {
      scroll: false
    });
    expect(navigation.refresh).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();

    const serverIdentity = `trend:${evidenceKey}`;
    view.rerender(
      <ReportEvidenceSheet
        evidence={readyEvidence}
        open
        resolvedEvidenceIdentity={serverIdentity}
        openHref={serverOpenHref}
        closeHref={liveHref}
        chartHeadingId="quality-trend-title"
      >
        <button type="button">Показать данные после Forward</button>
        </ReportEvidenceSheet>
    );
    const nativePush = vi.spyOn(window.history, "pushState");
    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));

    expect(window.location.pathname + window.location.search).toBe(liveHref);
    expect(navigation.push).toHaveBeenCalledOnce();
    expect(nativePush).toHaveBeenCalledWith(null, "", liveHref);
    expect(navigation.refresh).not.toHaveBeenCalled();
    nativePush.mockRestore();
  });

  it("rejects an invalid server evidence descriptor instead of trusting the browser URL", () => {
    const liveHref =
      `/reports?view=overview&period=vk-current&compare=none&grain=day&chartView=table&series=score%2Cvolume&evidenceType=driver&evidenceKey=${evidenceKey}`;
    const invalidOpenHref =
      "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score%2Cvolume&evidenceType=trend&evidenceKey=invalid";
    window.history.replaceState(null, "", liveHref);
    const pushState = vi.spyOn(window.history, "pushState");

    render(
      <ReportEvidenceSheet
        evidence={readyEvidence}
        open={false}
        resolvedEvidenceIdentity={null}
        openHref={invalidOpenHref}
        closeHref={closeHref}
        chartHeadingId="quality-trend-title"
      >
        <button type="button">Недоверенный срез</button>
      </ReportEvidenceSheet>
    );

    fireEvent.click(screen.getByRole("button", { name: "Недоверенный срез" }));

    expect(pushState).not.toHaveBeenCalled();
    expect(navigation.refresh).not.toHaveBeenCalled();
    expect(window.location.pathname + window.location.search).toBe(liveHref);
    pushState.mockRestore();
  });

  it("keeps inspection URL-neutral and opens only on click or Enter with push history", () => {
    render(fixture(false, <button type="button">Точка 24 июля</button>));

    const trigger = screen.getByRole("button", { name: "Точка 24 июля" });
    expect(trigger).toHaveAttribute(
      "id",
      `report-evidence-trigger-trend-${evidenceKey}`
    );

    fireEvent.mouseEnter(trigger);
    fireEvent.focus(trigger);
    fireEvent.touchStart(trigger);
    expect(navigation.push).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(navigation.refresh).not.toHaveBeenCalled();

    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(window.location.pathname + window.location.search).toBe(openHref);
    expect(navigation.push).toHaveBeenCalledOnce();
    fireEvent.keyUp(trigger, { key: "Enter" });

    navigation.push.mockClear();
    fireEvent.click(trigger);
    expect(window.location.pathname + window.location.search).toBe(openHref);
    expect(navigation.push).toHaveBeenCalledOnce();
  });

  it("renders an opaque RSC trigger without cloning across the client boundary", async () => {
    const opaqueServerTrigger = {
      $$typeof: Symbol.for("react.lazy"),
      _payload: {
        status: "fulfilled",
        value: <button type="button">Серверный триггер</button>
      },
      _init: (payload: { value: React.ReactElement }) => payload.value
    } as unknown as React.ReactElement;

    render(fixture(false, opaqueServerTrigger));

    const trigger = await screen.findByRole("button", {
      name: "Серверный триггер"
    });
    expect(trigger).toHaveAttribute(
      "id",
      `report-evidence-trigger-trend-${evidenceKey}`
    );

    fireEvent.click(trigger);
    expect(window.location.pathname + window.location.search).toBe(openHref);
    expect(navigation.push).toHaveBeenCalledOnce();
  });

  it("accepts descendants of the designated trigger but ignores interactive fragment siblings", () => {
    render(
      fixture(
        false,
        <>
          <button type="button">
            <span>Основной триггер</span>
          </button>
          <button type="button">Постороннее действие</button>
        </>
      )
    );

    const primaryLabel = screen.getByText("Основной триггер");
    const primary = primaryLabel.closest("button");
    const sibling = screen.getByRole("button", {
      name: "Постороннее действие"
    });
    expect(primary).toHaveAttribute(
      "id",
      `report-evidence-trigger-trend-${evidenceKey}`
    );
    expect(sibling).not.toHaveAttribute("data-report-evidence-trigger");

    fireEvent.click(sibling);
    expect(navigation.push).not.toHaveBeenCalled();

    fireEvent.click(primaryLabel);
    expect(navigation.push).toHaveBeenCalledOnce();
    expect(window.location.pathname + window.location.search).toBe(openHref);
  });

  it("rejects a nested interactive target when it is not the designated root", () => {
    render(
      fixture(
        false,
        <div role="button" tabIndex={0} aria-label="Составной триггер">
          <span>Фон триггера</span>
          <button type="button">Вложенное действие</button>
        </div>
      )
    );
    const root = screen.getByRole("button", { name: "Составной триггер" });
    const nested = screen.getByRole("button", {
      name: "Вложенное действие"
    });

    fireEvent.click(nested);
    expect(navigation.push).not.toHaveBeenCalled();

    fireEvent.click(root);
    expect(navigation.push).toHaveBeenCalledOnce();
  });

  it("prevents an accepted anchor fallback while preserving child cancellation", async () => {
    const childClick = vi.fn((event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
    });
    const view = render(
      fixture(false, <a href="#native-fallback">Ссылка на данные</a>)
    );
    const anchor = screen.getByRole("link", { name: "Ссылка на данные" });

    expect(fireEvent.click(anchor)).toBe(false);
    expect(navigation.push).toHaveBeenCalledOnce();
    expect(window.location.pathname + window.location.search).toBe(openHref);

    window.history.replaceState(null, "", closeHref);
    navigation.push.mockClear();
    view.rerender(
      fixture(
        false,
        <a href="#child-cancelled" onClick={childClick}>
          Отменённая ссылка
        </a>
      )
    );
    expect(
      fireEvent.click(
        screen.getByRole("link", { name: "Отменённая ссылка" })
      )
    ).toBe(false);
    expect(childClick).toHaveBeenCalledTimes(1);
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("routes an Enter activation once when the control emits its keyboard click", async () => {
    const childKeyDown = vi.fn(
      (event: React.KeyboardEvent<HTMLButtonElement>) => {
        event.preventDefault();
      }
    );
    const view = render(
      fixture(false, <button type="button">Клавиатурный триггер</button>)
    );
    const trigger = screen.getByRole("button", {
      name: "Клавиатурный триггер"
    });
    trigger.focus();
    expect(trigger).toHaveFocus();

    fireEvent.keyDown(trigger, { key: "Enter", repeat: true });
    expect(navigation.push).not.toHaveBeenCalled();

    expect(fireEvent.keyDown(trigger, { key: "Enter", repeat: false })).toBe(
      false
    );
    fireEvent.click(trigger, { detail: 0 });
    fireEvent.keyUp(trigger, { key: "Enter" });

    expect(navigation.push).toHaveBeenCalledOnce();
    expect(window.location.pathname + window.location.search).toBe(openHref);

    window.history.replaceState(null, "", closeHref);
    navigation.push.mockClear();
    view.rerender(
      fixture(
        false,
        <button type="button" onKeyDown={childKeyDown}>
          Отменённый Enter
        </button>
      )
    );
    fireEvent.keyDown(
      screen.getByRole("button", { name: "Отменённый Enter" }),
      { key: "Enter" }
    );
    expect(childKeyDown).toHaveBeenCalledTimes(1);
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("survives closed → open → closed while trapping focus and restores the exact trigger", async () => {
    const view = render(
      <>
        <button type="button">Показать данные</button>
        {fixture(false, <button type="button">Показать данные</button>)}
      </>
    );
    const triggers = screen.getAllByRole("button", { name: "Показать данные" });
    const exactTrigger = triggers[1];
    exactTrigger.focus();
    fireEvent.click(exactTrigger);

    view.rerender(
      <>
        <button type="button">Показать данные</button>
        {fixture(true, <button type="button">Показать данные</button>)}
      </>
    );

    const dialog = screen.getByRole("dialog", { name: "Данные и примеры" });
    await waitFor(() => {
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    });
    expect(dialog).toHaveClass(
      "data-[side=right]:sm:max-w-none",
      "data-[side=right]:min-[641px]:w-[26rem]",
      "data-[side=right]:min-[641px]:max-w-[28rem]"
    );
    expect(dialog).not.toHaveClass("data-[side=right]:sm:max-w-sm");
    expect(dialog.className).not.toMatch(/space-y-/);
    expect(within(dialog).getByText(readyEvidence.description)).toBeInTheDocument();
    expect(
      within(dialog).getByRole("link", { name: /Freshdesk/i })
    ).toHaveAttribute("href", readyEvidence.rows[0].href);
    expect(within(dialog).getByText(/Высокий риск/)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Связано с выбранной выборкой/)
    ).toBeInTheDocument();
    expect(document.querySelector('[data-slot="card"]')).not.toBeInTheDocument();

    const close = within(dialog).getByRole("button", { name: "Закрыть" });
    expect(close.querySelector("svg")).toHaveAttribute(
      "data-icon",
      "inline-start"
    );
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    const lastEvidenceLink = within(dialog).getByRole("link", {
      name: /Freshdesk/i
    });
    lastEvidenceLink.focus();
    fireEvent.keyDown(lastEvidenceLink, { key: "Tab" });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    fireEvent.click(close);
    expect(window.location.pathname + window.location.search).toBe(closeHref);
    expect(navigation.push).toHaveBeenCalledOnce();

    view.rerender(
      <>
        <button type="button">Показать данные</button>
        {fixture(false, <button type="button">Показать данные</button>)}
      </>
    );
    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: "Показать данные" })[1]
      ).toHaveFocus();
    });
  });

  it("dismisses and restores focus before the controlled URL prop catches up", async () => {
    const view = render(
      fixture(false, <button type="button">Медленный переход</button>)
    );
    const trigger = screen.getByRole("button", {
      name: "Медленный переход"
    });
    trigger.focus();
    fireEvent.click(trigger);

    view.rerender(
      fixture(true, <button type="button">Медленный переход</button>)
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Закрыть" })
    );
    expect(window.location.pathname + window.location.search).toBe(closeHref);
    expect(navigation.push).toHaveBeenCalledOnce();

    await waitFor(() => {
      expect(
        document.querySelector('[data-slot="sheet-content"][data-open]')
      ).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });
  });

  it("clears the optimistic dismissal after controlled close → reopen", async () => {
    const view = render(fixture(true));

    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Данные и примеры" })
      ).not.toBeInTheDocument();
    });

    view.rerender(fixture(false));
    view.rerender(fixture(true));

    expect(
      await screen.findByRole("dialog", { name: "Данные и примеры" })
    ).toBeInTheDocument();
  });

  it("reopens a dismissed sheet only after the controlled identity catches up", async () => {
    const view = render(
      fixture(false, <button type="button">Повторно открыть</button>)
    );
    const trigger = screen.getByRole("button", {
      name: "Повторно открыть"
    });
    trigger.focus();
    fireEvent.click(trigger);
    view.rerender(
      fixture(true, <button type="button">Повторно открыть</button>)
    );

    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    await waitFor(() => {
      expect(trigger).toHaveFocus();
      expect(
        screen.queryByRole("dialog", { name: "Данные и примеры" })
      ).not.toBeInTheDocument();
    });

    fireEvent.click(trigger);

    expect(window.location.pathname + window.location.search).toBe(openHref);
    expect(navigation.push).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByRole("dialog", { name: "Данные и примеры" })
    ).not.toBeInTheDocument();

    view.rerender(
      fixture(true, <button type="button">Повторно открыть</button>)
    );
    expect(
      await screen.findByRole("dialog", { name: "Данные и примеры" })
    ).toBeInTheDocument();
  });

  it("opens replacement evidence only after the live URL matches its server identity", async () => {
    window.history.replaceState(null, "", openHref);
    const view = render(
      <ReportEvidenceSheet
        evidence={readyEvidence}
        open
        resolvedEvidenceIdentity={resolvedEvidenceIdentity}
        openHref={openHref}
        closeHref={closeHref}
        chartHeadingId="quality-trend-title"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Данные и примеры" })
      ).not.toBeInTheDocument();
    });

    window.history.replaceState(null, "", alternateOpenHref);
    view.rerender(
      <ReportEvidenceSheet
        evidence={alternateEvidence}
        open
        resolvedEvidenceIdentity={alternateEvidenceIdentity}
        openHref={openHref}
        closeHref={closeHref}
        chartHeadingId="quality-trend-title"
      />
    );

    const replacement = await screen.findByRole("dialog", {
      name: "Данные и примеры"
    });
    expect(
      within(replacement).getByText(alternateEvidence.title)
    ).toBeInTheDocument();
  });

  it("supports repeated Back and Forward controlled reopen cycles after optimistic closes", async () => {
    const view = render(fixture(true));

    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Данные и примеры" })
      ).not.toBeInTheDocument();
    });
    view.rerender(fixture(false));
    view.rerender(fixture(true));
    expect(
      await screen.findByRole("dialog", { name: "Данные и примеры" })
    ).toBeInTheDocument();

    fireEvent.keyDown(
      screen.getByRole("dialog", { name: "Данные и примеры" }),
      { key: "Escape" }
    );
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Данные и примеры" })
      ).not.toBeInTheDocument();
    });
    view.rerender(fixture(false));
    view.rerender(fixture(true));

    expect(
      await screen.findByRole("dialog", { name: "Данные и примеры" })
    ).toBeInTheDocument();
  });

  it("records the exact app-owned chart focus root and closes on Escape", async () => {
    const view = render(
      <>
        <div
          data-testid="chart-focus-root"
          data-accessibility-layer="app-owned"
          tabIndex={0}
        />
        {fixture(false)}
      </>
    );
    const chartRoot = screen.getByTestId("chart-focus-root");
    chartRoot.focus();

    view.rerender(
      <>
        <div
          data-testid="chart-focus-root"
          data-accessibility-layer="app-owned"
          tabIndex={0}
        />
        {fixture(true)}
      </>
    );
    const dialog = screen.getByRole("dialog", { name: "Данные и примеры" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(window.location.pathname + window.location.search).toBe(closeHref);
    expect(navigation.push).not.toHaveBeenCalled();

    view.rerender(
      <>
        <div
          data-testid="chart-focus-root"
          data-accessibility-layer="app-owned"
          tabIndex={0}
        />
        {fixture(false)}
      </>
    );
    await waitFor(() => {
      expect(screen.getByTestId("chart-focus-root")).toHaveFocus();
    });
  });

  it("recognizes an immutable chart-table evidence link, gives it a deterministic id, and restores that exact link", async () => {
    const view = render(
      <>
        <h2 id="quality-trend-title">
          Динамика качества
        </h2>
        <a key="original-trigger" href={openHref}>24 июля</a>
        <ReportEvidenceSheet
          evidence={readyEvidence}
          open={false}
          resolvedEvidenceIdentity={null}
          openHref={openHref}
          closeHref={closeHref}
          chartHeadingId="quality-trend-title"
        />
      </>
    );
    const tableLink = screen.getByRole("link", { name: "24 июля" });
    tableLink.focus();
    expect(tableLink).toHaveAttribute(
      "id",
      `report-evidence-trigger-trend-${evidenceKey}-link-1`
    );

    window.history.replaceState(null, "", openHref);
    view.rerender(
      <>
        <h2 id="quality-trend-title">
          Динамика качества
        </h2>
        <a key="replacement-trigger" href={openHref}>24 июля</a>
        <ReportEvidenceSheet
          evidence={readyEvidence}
          open
          resolvedEvidenceIdentity={resolvedEvidenceIdentity}
          openHref={openHref}
          closeHref={closeHref}
          chartHeadingId="quality-trend-title"
        />
      </>
    );
    expect(tableLink.isConnected).toBe(false);
    const replacementTrigger = document.getElementById(tableLink.id);
    expect(replacementTrigger).toBeInstanceOf(HTMLAnchorElement);
    expect(replacementTrigger).toHaveAttribute("id", tableLink.id);
    fireEvent.click(
      screen.getByRole("button", { name: "Закрыть" })
    );
    await waitFor(() => {
      expect(replacementTrigger).toHaveFocus();
    });
    view.rerender(
      <>
        <h2 id="quality-trend-title">
          Динамика качества
        </h2>
        <a key="replacement-trigger" href={openHref}>24 июля</a>
        <ReportEvidenceSheet
          evidence={readyEvidence}
          open={false}
          resolvedEvidenceIdentity={null}
          openHref={openHref}
          closeHref={closeHref}
          chartHeadingId="quality-trend-title"
        />
      </>
    );
    expect(screen.getByRole("link", { name: "24 июля" })).toHaveFocus();
  });

  it("assigns deterministic unique ids to same-key table links and restores the exact activated link", async () => {
    const view = render(
      <>
        <h2 id="quality-trend-title">
          Динамика качества
        </h2>
        <ReportEvidenceSheet
          evidence={readyEvidence}
          open={false}
          resolvedEvidenceIdentity={null}
          openHref={openHref}
          closeHref={closeHref}
          chartHeadingId="quality-trend-title"
        >
          <button type="button">Показать данные</button>
        </ReportEvidenceSheet>
        <a href={openHref}>Первая строка</a>
        <a href={openHref}>Вторая строка</a>
      </>
    );
    const first = screen.getByRole("link", { name: "Первая строка" });
    const second = screen.getByRole("link", { name: "Вторая строка" });
    first.focus();
    second.focus();

    const ids = [
      screen.getByRole("button", { name: "Показать данные" }).id,
      first.id,
      second.id
    ];
    expect(new Set(ids).size).toBe(3);
    expect(ids.every((id) => id.startsWith(
      `report-evidence-trigger-trend-${evidenceKey}`
    ))).toBe(true);

    window.history.replaceState(null, "", openHref);
    view.rerender(
      <>
        <h2 id="quality-trend-title">
          Динамика качества
        </h2>
        <ReportEvidenceSheet
          evidence={readyEvidence}
          open
          resolvedEvidenceIdentity={resolvedEvidenceIdentity}
          openHref={openHref}
          closeHref={closeHref}
          chartHeadingId="quality-trend-title"
        >
          <button type="button">Показать данные</button>
        </ReportEvidenceSheet>
        <a href={openHref}>Первая строка</a>
        <a href={openHref}>Вторая строка</a>
      </>
    );
    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    view.rerender(
      <>
        <h2 id="quality-trend-title" tabIndex={-1}>
          Динамика качества
        </h2>
        <ReportEvidenceSheet
          evidence={readyEvidence}
          open={false}
          resolvedEvidenceIdentity={null}
          openHref={openHref}
          closeHref={closeHref}
          chartHeadingId="quality-trend-title"
        >
          <button type="button">Показать данные</button>
        </ReportEvidenceSheet>
        <a href={openHref}>Первая строка</a>
        <a href={openHref}>Вторая строка</a>
      </>
    );
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Вторая строка" })).toHaveFocus();
    });
  });

  it("uses the chart heading after a direct deep link and exposes one generic unavailable state", async () => {
    const unavailable = unavailableEvidence;
    window.history.replaceState(null, "", openHref);
    const view = render(
      <>
        <h2 id="quality-trend-title">
          Динамика качества
        </h2>
        <ReportEvidenceSheet
          evidence={unavailable}
          open
          resolvedEvidenceIdentity={resolvedEvidenceIdentity}
          openHref={openHref}
          closeHref={closeHref}
          chartHeadingId="quality-trend-title"
        />
      </>
    );

    const dialog = screen.getByRole("dialog", { name: "Данные и примеры" });
    expect(within(dialog).getByText(unavailable.title)).toBeInTheDocument();
    expect(within(dialog).queryByText(/не найден|нет прав|чуж/i)).not.toBeInTheDocument();

    fireEvent.keyDown(dialog, { key: "Escape" });
    view.rerender(
      <>
        <h2 id="quality-trend-title">
          Динамика качества
        </h2>
        <ReportEvidenceSheet
          evidence={unavailable}
          open={false}
          resolvedEvidenceIdentity={null}
          openHref={openHref}
          closeHref={closeHref}
          chartHeadingId="quality-trend-title"
        />
      </>
    );
    await waitFor(() => {
      const heading = screen.getByRole("heading", {
        name: "Динамика качества"
      });
      expect(heading).toHaveAttribute("tabindex", "-1");
      expect(heading).toHaveFocus();
    });
  });

  it("mints the default evidence href from live URL state when the server prop is stale", async () => {
    const liveHref =
      "/reports?view=overview&period=vk-current&compare=none&grain=day&chartView=table&series=score%2Cvolume";
    const remintedKey = `ev1_${"C".repeat(43)}`;
    const remintedHref = `${liveHref}&evidenceType=trend&evidenceKey=${remintedKey}`;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ href: remintedHref, result: readyEvidence })
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState(null, "", liveHref);
    render(
      <>
        <h2 id="quality-trend-title">Динамика качества</h2>
        <ReportEvidenceSheet
          evidence={unavailableEvidence}
          open={false}
          resolvedEvidenceIdentity={null}
          defaultEvidence={{
            identity: resolvedEvidenceIdentity,
            result: readyEvidence
          }}
          openHref={openHref}
          closeHref={closeHref}
          chartHeadingId="quality-trend-title"
        >
          <button type="button">Открыть с живым состоянием</button>
        </ReportEvidenceSheet>
      </>
    );
    const trigger = screen.getByRole("button", {
      name: "Открыть с живым состоянием"
    });
    trigger.focus();
    fireEvent.click(trigger);

    // The stale prop base must never reach the address bar: the live state
    // stays until the re-minted pair arrives.
    expect(window.location.pathname + window.location.search).toBe(liveHref);
    expect(navigation.push).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(window.location.pathname + window.location.search).toBe(
        remintedHref
      );
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`from=${encodeURIComponent(openHref)}`),
      expect.objectContaining({
        headers: expect.objectContaining({ accept: "application/json" })
      })
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Данные и примеры"
    });
    expect(
      within(dialog).getByText(readyEvidence.title)
    ).toBeInTheDocument();
  });

  it("wraps Tab and Shift+Tab synchronously between the first and last tabbable", async () => {
    window.history.replaceState(null, "", openHref);
    render(
      <>
        <h2 id="quality-trend-title">Динамика качества</h2>
        <ReportEvidenceSheet
          evidence={readyEvidence}
          open
          resolvedEvidenceIdentity={resolvedEvidenceIdentity}
          openHref={openHref}
          closeHref={closeHref}
          chartHeadingId="quality-trend-title"
        />
      </>
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Данные и примеры"
    });
    const close = within(dialog).getByRole("button", { name: "Закрыть" });
    const link = within(dialog).getByRole("link", { name: /Freshdesk/i });

    // The floating focus guards redirect on the next animation frame, so a
    // keyboard focus read can catch the hidden sentinel; wrapping locally at
    // the edges keeps every Tab stop inside the sheet deterministically.
    link.focus();
    fireEvent.keyDown(link, { key: "Tab" });
    expect(close).toHaveFocus();

    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(link).toHaveFocus();
  });

  it("renders no more than five PII-minimized evidence rows", () => {
    const evidence: ReportEvidenceResult = {
      ...readyEvidence,
      rows: Array.from({ length: 7 }, (_, index) => ({
        ...readyEvidence.rows[0],
        id: `review-${index + 1}`,
        conversationId: `conversation-${index + 1}`,
        href: `/reviews/conversation-${index + 1}`
      }))
    };
    window.history.replaceState(null, "", openHref);
    render(
      <ReportEvidenceSheet
        evidence={evidence}
        open
        resolvedEvidenceIdentity={resolvedEvidenceIdentity}
        openHref={openHref}
        closeHref={closeHref}
        chartHeadingId="quality-trend-title"
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Данные и примеры" });
    expect(within(dialog).getAllByRole("link")).toHaveLength(5);
    expect(within(dialog).queryByText("conversation-6")).not.toBeInTheDocument();
  });
});
