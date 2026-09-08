import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppNavShell } from "@/components/app-nav-shell";
import { analystMineOverdueHref } from "@/lib/auth/role-home";
import { buildShellNavigation, visibleTopNavAreas } from "@/lib/shell/navigation";

const mocks = vi.hoisted(() => ({
  pathname: "/reviews",
  search: "",
  routerPush: vi.fn(),
  switchCurrentUser: vi.fn(),
  takeNextReview: vi.fn()
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(mocks.search),
  useRouter: () => ({ push: mocks.routerPush })
}));

vi.mock("@/lib/user-actions", () => ({
  switchCurrentUser: mocks.switchCurrentUser
}));

vi.mock("@/lib/queue-view-actions", () => ({
  takeNextReview: mocks.takeNextReview
}));

// Base UI dialog / cmdk rely on APIs missing from jsdom.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);
Element.prototype.scrollIntoView = vi.fn();

const navigation = buildShellNavigation({ role: "ADMIN" });
const baseProps = {
  navigation,
  // AppNav всегда передает роль-фильтрованный список — тест повторяет это.
  areas: visibleTopNavAreas("ADMIN"),
  pulseItems: [
    { href: "/reviews?qaStatus=QUEUED", label: "Очередь", value: 4 },
    { href: "/reviews?status=reviewed&riskLevel=HIGH_OR_CRITICAL", label: "Риск", value: 1, tone: "risk" as const },
    { href: "/coaching", label: "Обучение", value: 0, tone: "neutral" as const }
  ],
  user: { name: "Админ", email: "admin@example.com" }
};

function areaNav() {
  return screen.getByRole("navigation", { name: "Основные разделы" });
}

describe("app nav shell", () => {
  beforeEach(() => {
    mocks.pathname = "/reviews";
    mocks.search = "";
    mocks.routerPush.mockClear();
    mocks.takeNextReview.mockClear();
    mocks.switchCurrentUser.mockClear();
    window.history.replaceState(null, "", "/reviews");
  });

  it("points the brand mark at the supplied role home instead of hardcoded dashboard", () => {
    render(<AppNavShell {...baseProps} homeHref="/self-review" />);

    const brand = screen.getByRole("link", { name: "КК поддержки" });
    expect(brand.getAttribute("href")).toBe("/self-review");
  });

  it("keeps the global navigation surface flat and opaque", () => {
    render(<AppNavShell {...baseProps} />);

    const globalNav = screen.getByRole("banner", { name: "Глобальная навигация" });
    expect(globalNav.className).toContain("bg-background");
    expect(globalNav.className).not.toMatch(/backdrop-blur|supports-backdrop-filter/);
    expect(globalNav.className).not.toContain("bg-background/90");
  });

  it("does not paint the risk pulse as destructive when the count is 0", () => {
    render(
      <AppNavShell
        {...baseProps}
        pulseItems={[
          { href: "/reviews?qaStatus=QUEUED", label: "Очередь", value: 0 },
          {
            href: "/reviews?status=reviewed&riskLevel=HIGH_OR_CRITICAL",
            label: "Риск",
            value: 0,
            tone: "neutral"
          }
        ]}
      />
    );

    const pulseSurfaces = screen.getAllByLabelText("Рабочий пульс");
    const pulse = pulseSurfaces.find((element) => element.tagName === "DIV");
    expect(pulse).toBeDefined();
    const risk = within(pulse!).getByRole("link", { name: "Риск: 0" });
    expect(risk.querySelector('[class*="bg-destructive"]')).toBeNull();
  });

  it("exposes the app-nav focus-ring contract hook on the global navigation", () => {
    // P4: globals.css scopes a full-strength token ring to
    // [data-slot="app-nav"] :focus-visible.
    render(<AppNavShell {...baseProps} />);

    expect(
      screen.getByRole("banner", { name: "Глобальная навигация" })
    ).toHaveAttribute("data-slot", "app-nav");
  });

  it("highlights Сегодня on the analyst mine+overdue inbox, not Проверки", () => {
    const inbox = analystMineOverdueHref("Анна QA");
    mocks.pathname = "/reviews";
    mocks.search = inbox.split("?")[1] ?? "";
    const areas = visibleTopNavAreas("QA_ANALYST", { name: "Анна QA" });

    render(<AppNavShell {...baseProps} areas={areas} />);

    expect(within(areaNav()).getByRole("link", { name: /Сегодня/ }).getAttribute("aria-current")).toBe(
      "page"
    );
    expect(within(areaNav()).getByRole("link", { name: /Проверки/ }).getAttribute("aria-current")).toBeNull();
    expect(
      within(areaNav())
        .getAllByRole("link")
        .filter((link) => link.getAttribute("aria-current") === "page")
    ).toHaveLength(1);
  });

  it("marks the active product area with aria-current via longest-prefix match", () => {
    mocks.pathname = "/reviews/abc";

    render(<AppNavShell {...baseProps} />);

    expect(within(areaNav()).getByRole("link", { name: /Проверки/ }).getAttribute("aria-current")).toBe(
      "page"
    );
    expect(within(areaNav()).getByRole("link", { name: /Аналитика/ }).getAttribute("aria-current")).toBeNull();
    expect(
      within(areaNav())
        .getAllByRole("link")
        .filter((link) => link.getAttribute("aria-current") === "page")
    ).toHaveLength(1);
  });

  it("highlights the settings area on admin routes", () => {
    mocks.pathname = "/admin/integrations";

    render(<AppNavShell {...baseProps} />);

    const active = within(areaNav())
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");
    expect(active).toHaveLength(1);
    expect(active[0]?.textContent).toContain("Настройки");
  });

  it("highlights Settings for a QA analyst on report-schedules", () => {
    mocks.pathname = "/admin/report-schedules";
    const areas = visibleTopNavAreas("QA_ANALYST", { name: "Анна QA" });

    render(<AppNavShell {...baseProps} areas={areas} />);

    expect(within(areaNav()).getByRole("link", { name: /Настройки/ }).getAttribute("href")).toBe(
      "/admin"
    );
    expect(within(areaNav()).getByRole("link", { name: /Настройки/ }).getAttribute("aria-current")).toBe(
      "page"
    );
  });

  it("opens the command palette with the ⌘K keybinding and filters items", () => {
    render(<AppNavShell {...baseProps} />);

    expect(screen.queryByRole("dialog", { name: "Поиск и команды" })).toBeNull();

    fireEvent.keyDown(window, { key: "k", metaKey: true });

    const dialog = screen.getByRole("dialog", { name: "Поиск и команды" });
    expect(dialog).not.toBeNull();

    fireEvent.change(screen.getByPlaceholderText(/Найти раздел/), { target: { value: "калибров" } });
    const results = within(dialog).getAllByRole("option");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((item) => /калибров/i.test(item.textContent ?? ""))).toBe(true);

    // Base UI Dialog handles Escape on the popup (not only on window).
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Поиск и команды" })).toBeNull();
  });

  it("exposes the command trigger as a dialog-opening button via aria attributes", () => {
    render(<AppNavShell {...baseProps} />);

    const trigger = screen.getByRole("button", { name: /Поиск или команда/ });
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  function expectTakeNextFormData(queueHref: string | null) {
    expect(mocks.takeNextReview).toHaveBeenCalledTimes(1);
    const formData = mocks.takeNextReview.mock.calls[0]?.[0] as FormData;
    expect(formData.get("queueHref")).toBe(queueHref);
    expect(mocks.routerPush).not.toHaveBeenCalled();
    expect(mocks.routerPush).not.toHaveBeenCalledWith("/reviews?status=unreviewed");
    expect(
      screen.queryByRole("link", { name: "Взять следующий" })
    ).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Поиск и команды" })).toBeNull();
  }

  function runCommandTakeNext() {
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const dialog = screen.getByRole("dialog", { name: "Поиск и команды" });
    const input = screen.getByPlaceholderText(/Найти раздел/);
    fireEvent.change(input, { target: { value: "следующий кейс" } });
    const options = within(dialog).getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]?.textContent).toContain("Взять следующий");
    fireEvent.keyDown(input, { key: "Enter" });
  }

  it.each([
    {
      surface: "⌘K",
      run: () => runCommandTakeNext()
    },
    {
      surface: "pulse «Взять следующий»",
      run: () => fireEvent.click(screen.getByRole("button", { name: "Взять следующий" }))
    },
    {
      surface: "pulse menu",
      run: () => {
        fireEvent.click(screen.getByRole("button", { name: "Рабочий пульс" }));
        fireEvent.click(
          within(screen.getByRole("menu", { name: "Рабочий пульс" })).getByRole("menuitem", {
            name: "Взять следующий"
          })
        );
      }
    }
  ] as const)(
    "runs $surface through takeNextReview with the current queue filters",
    ({ run }) => {
      // Tester on a saved/filtered queue (due + process) — not the unreviewed impostor.
      window.history.replaceState(null, "", "/reviews?due=overdue&process=ai_exception");
      render(<AppNavShell {...baseProps} />);

      run();

      expectTakeNextFormData("/reviews?due=overdue&process=ai_exception");
    }
  );

  it("does not substitute /reviews?status=unreviewed when take-next runs off the queue", () => {
    window.history.replaceState(null, "", "/dashboard");
    mocks.pathname = "/dashboard";
    render(<AppNavShell {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Взять следующий" }));

    expectTakeNextFormData(null);
  });

  it("hides every take-next surface when the reviewer cannot write reviews", () => {
    render(<AppNavShell {...baseProps} canTakeNextCase={false} />);

    // Pulse chrome first — opening ⌘K inerts the rest of the page.
    expect(screen.queryByRole("button", { name: "Взять следующий" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Рабочий пульс" }));
    expect(
      within(screen.getByRole("menu", { name: "Рабочий пульс" })).queryByRole("menuitem", {
        name: "Взять следующий"
      })
    ).toBeNull();
    fireEvent.keyDown(screen.getByRole("menu", { name: "Рабочий пульс" }), { key: "Escape" });

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const input = screen.getByPlaceholderText(/Найти раздел/);
    fireEvent.change(input, { target: { value: "следующий кейс" } });
    expect(screen.queryByRole("option", { name: /Взять следующий/ })).toBeNull();
  });

  it("moves a highlighted result with Up/Down and activates it with Enter", () => {
    render(<AppNavShell {...baseProps} />);

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const dialog = screen.getByRole("dialog", { name: "Поиск и команды" });
    const input = screen.getByPlaceholderText(/Найти раздел/);
    fireEvent.change(input, { target: { value: "калибров" } });
    const options = within(dialog).getAllByRole("option");
    expect(options).toHaveLength(2);

    // First option starts highlighted by cmdk.
    expect(options[0]?.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    const afterDown = within(dialog).getAllByRole("option");
    expect(afterDown[1]?.getAttribute("aria-selected")).toBe("true");
    expect(afterDown[0]?.getAttribute("aria-selected")).toBe("false");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(mocks.routerPush).toHaveBeenCalledWith("/calibration");
    expect(screen.queryByRole("dialog", { name: "Поиск и команды" })).toBeNull();
  });

  it("closes the palette when the backdrop is clicked", () => {
    render(<AppNavShell {...baseProps} />);

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.getByRole("dialog", { name: "Поиск и команды" })).not.toBeNull();

    const overlay = document.querySelector('[data-slot="dialog-overlay"]') as HTMLElement | null;
    expect(overlay).not.toBeNull();
    fireEvent.pointerDown(overlay!);
    fireEvent.click(overlay!);
    expect(screen.queryByRole("dialog", { name: "Поиск и команды" })).toBeNull();
  });

  it("keeps work-pulse links meaningfully named when responsive labels are hidden", () => {
    render(<AppNavShell {...baseProps} />);

    const queueLink = screen.getByRole("link", { name: "Очередь: 4" });
    expect(queueLink.getAttribute("href")).toBe("/reviews?qaStatus=QUEUED");
    expect(queueLink).toHaveAttribute("data-slot", "button");
    expect(queueLink.className).toContain("hidden");
    expect(queueLink.className).toContain("sm:inline-flex");
    expect(screen.getByRole("link", { name: "Риск: 1" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "Обучение: 0" })).not.toBeNull();
  });

  it("keeps every pulse destination in one compact mobile menu", () => {
    render(<AppNavShell {...baseProps} />);

    const trigger = screen.getByRole("button", { name: "Рабочий пульс" });
    expect(trigger).toHaveAttribute("data-slot", "dropdown-menu-trigger");
    expect(trigger).toHaveClass("size-11", "sm:hidden");

    fireEvent.click(trigger);
    const menu = screen.getByRole("menu", { name: "Рабочий пульс" });
    const destinations = within(menu)
      .getAllByRole("menuitem")
      .map((item) => item.getAttribute("href"));

    expect(destinations).toEqual([
      "/reviews?qaStatus=QUEUED",
      "/reviews?status=reviewed&riskLevel=HIGH_OR_CRITICAL",
      "/coaching",
      null
    ]);
    expect(destinations).not.toContain("/reviews?status=unreviewed");
    expect(within(menu).getByRole("menuitem", { name: "Очередь: 4" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Риск: 1" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Обучение: 0" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Взять следующий" })).toBeInTheDocument();
  });

  it("uses 44px-capable shadcn targets for the logo and direct navigation actions", () => {
    render(<AppNavShell {...baseProps} />);

    const logo = screen.getByRole("link", { name: "КК поддержки" });
    expect(logo.getAttribute("href")).toBe("/dashboard");
    expect(logo.className).toContain("size-11");

    for (const link of within(areaNav()).getAllByRole("link")) {
      expect(link).toHaveAttribute("data-slot", "button");
    }
    expect(screen.getByRole("button", { name: "Взять следующий" })).toHaveAttribute(
      "data-slot",
      "button"
    );
  });

  it("submits logout through a native post form inside the identity menu", () => {
    render(<AppNavShell {...baseProps} />);

    // Identity popover is portaled; open it before looking for the logout action.
    fireEvent.click(screen.getByRole("button", { name: /Админ/ }));
    const logoutButton = screen.getByRole("button", { name: "Выйти" });
    const logoutForm = logoutButton.closest("form");

    expect(logoutForm).not.toBeNull();
    expect(logoutForm?.getAttribute("action")).toBe("/auth/logout");
    expect(logoutForm?.getAttribute("method")).toBe("post");
  });

  it("collapses the primary areas into an accessible disclosure menu trigger", () => {
    render(<AppNavShell {...baseProps} />);

    const trigger = screen.getByRole("button", { name: "Разделы" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.textContent).toContain("Проверки");

    // The disclosure menu is closed until the trigger is activated.
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("derives the compact menu and full navigation from the same active-area contract", () => {
    mocks.pathname = "/reviews/abc";
    render(<AppNavShell {...baseProps} />);

    const fullLinks = within(areaNav()).getAllByRole("link");
    const fullDestinations = fullLinks.map((link) => link.getAttribute("href"));
    expect(fullDestinations).toEqual(baseProps.areas.map((area) => area.href));
    expect(fullLinks.filter((link) => link.getAttribute("aria-current") === "page")).toHaveLength(1);

    const trigger = screen.getByRole("button", { name: "Разделы" });
    fireEvent.click(trigger);
    const menuLinks = within(screen.getByRole("menu")).getAllByRole("menuitem");
    expect(menuLinks.map((link) => link.getAttribute("href"))).toEqual(fullDestinations);
    expect(menuLinks.filter((link) => link.getAttribute("aria-current") === "page")).toHaveLength(1);
  });

  it("keeps the compact trigger generic when the matched area is filtered out", () => {
    mocks.pathname = "/reports";
    const filteredAreas = baseProps.areas.filter((area) => area.id !== "analytics");
    render(<AppNavShell {...baseProps} areas={filteredAreas} />);

    const trigger = screen.getByRole("button", { name: "Разделы" });
    expect(trigger.textContent).toContain("Разделы");
    expect(trigger.textContent).not.toContain("Сегодня");
    expect(
      within(areaNav())
        .getAllByRole("link")
        .filter((link) => link.getAttribute("aria-current") === "page")
    ).toHaveLength(0);

    fireEvent.click(trigger);
    expect(
      within(screen.getByRole("menu"))
        .getAllByRole("menuitem")
        .filter((link) => link.getAttribute("aria-current") === "page")
    ).toHaveLength(0);
  });

  it("drops the burger trigger entirely when there are no visible areas", () => {
    render(<AppNavShell {...baseProps} areas={[]} />);

    // Пустой список областей не должен оставлять кнопку-огрызок «Разделы».
    expect(screen.queryByRole("button", { name: "Разделы" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Основные разделы" })).toBeNull();
  });

  it("opens and closes the mobile area menu and exposes the areas as menu links", () => {
    mocks.pathname = "/reviews/abc";
    render(<AppNavShell {...baseProps} />);

    const trigger = screen.getByRole("button", { name: "Разделы" });
    fireEvent.click(trigger);

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    // Base UI associates the popup name with the trigger ("Разделы"); match by role only.
    const menu = screen.getByRole("menu");
    expect(menu.getAttribute("aria-label")).toBe("Основные разделы");
    const links = within(menu).getAllByRole("menuitem");
    expect(links.map((link) => link.textContent)).toEqual([
      "Сегодня",
      "Проверки",
      "Калибровка",
      "Обучение",
      "Аналитика",
      "Настройки"
    ]);
    // The active area is marked inside the disclosure menu too.
    expect(within(menu).getByRole("menuitem", { name: /Проверки/ }).getAttribute("aria-current")).toBe(
      "page"
    );

    // Escape closes the menu and returns aria-expanded to false.
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes the mobile area menu when one of its links is chosen", () => {
    render(<AppNavShell {...baseProps} />);

    const trigger = screen.getByRole("button", { name: "Разделы" });
    fireEvent.click(trigger);
    const menu = screen.getByRole("menu");

    const analyticsLink = within(menu).getByRole("menuitem", { name: /Аналитика/ });
    analyticsLink.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(analyticsLink);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("sends the brand mark to the role home instead of a hard-coded dashboard", () => {
    render(
      <AppNavShell
        {...baseProps}
        homeHref="/reviews?qaAssignee=%D0%90%D0%BD%D0%BD%D0%B0%20QA&due=overdue"
      />
    );

    expect(screen.getByRole("link", { name: "КК поддержки" }).getAttribute("href")).toBe(
      "/reviews?qaAssignee=%D0%90%D0%BD%D0%BD%D0%B0%20QA&due=overdue"
    );
  });

  it("switches a demo role in two clicks from the persistent header control", () => {
    render(
      <AppNavShell
        {...baseProps}
        demoSwitcher={{
          currentUserId: "user-1",
          roleLabel: "Администратор",
          users: [
            {
              id: "user-1",
              name: "Админ",
              roleLabel: "Администратор",
              optionLabel: "Админ · Администратор · Демо"
            },
            {
              id: "user-2",
              name: "Оператор",
              roleLabel: "Оператор",
              optionLabel: "Оператор · Демо"
            }
          ]
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Сменить роль" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Оператор · Демо" }));

    expect(mocks.switchCurrentUser).toHaveBeenCalledTimes(1);
    const formData = mocks.switchCurrentUser.mock.calls[0]?.[0] as FormData;
    expect(formData.get("userId")).toBe("user-2");
  });

  it("lists seeded roles inside the account menu without a second confirm click", () => {
    render(
      <AppNavShell
        {...baseProps}
        demoSwitcher={{
          currentUserId: "user-1",
          roleLabel: "Администратор",
          users: [
            {
              id: "user-1",
              name: "Админ",
              roleLabel: "Администратор",
              optionLabel: "Админ · Администратор · Демо"
            },
            {
              id: "user-2",
              name: "Анна QA",
              roleLabel: "Проверяющий",
              optionLabel: "Анна QA · Проверяющий · Демо"
            }
          ]
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Администратор/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Анна QA · Проверяющий · Демо" }));

    expect(mocks.switchCurrentUser).toHaveBeenCalledTimes(1);
    const formData = mocks.switchCurrentUser.mock.calls[0]?.[0] as FormData;
    expect(formData.get("userId")).toBe("user-2");
  });
});
