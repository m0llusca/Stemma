import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppNavShell } from "@/components/app-nav-shell";
import { buildShellNavigation, visibleTopNavAreas } from "@/lib/shell/navigation";

const mocks = vi.hoisted(() => ({
  pathname: "/reviews",
  routerPush: vi.fn(),
  switchCurrentUser: vi.fn()
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.routerPush })
}));

vi.mock("@/lib/user-actions", () => ({
  switchCurrentUser: mocks.switchCurrentUser
}));

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

describe("app nav shell", () => {
  beforeEach(() => {
    mocks.pathname = "/reviews";
  });

  it("marks the active product area with aria-current via longest-prefix match", () => {
    mocks.pathname = "/reviews/abc";

    render(<AppNavShell {...baseProps} />);

    expect(screen.getByRole("link", { name: /Проверки/ }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: /Аналитика/ }).getAttribute("aria-current")).toBeNull();
    expect(document.querySelectorAll('.app-nav__area[aria-current="page"]')).toHaveLength(1);
  });

  it("highlights the settings area on admin routes", () => {
    mocks.pathname = "/admin/integrations";

    render(<AppNavShell {...baseProps} />);

    const active = document.querySelectorAll('.app-nav__area[aria-current="page"]');
    expect(active).toHaveLength(1);
    expect(active[0]?.textContent).toContain("Настройки");
  });

  it("opens the command palette with the ⌘K keybinding and filters items", () => {
    render(<AppNavShell {...baseProps} />);

    expect(screen.queryByRole("dialog", { name: "Поиск и команды" })).toBeNull();

    fireEvent.keyDown(window, { key: "k", metaKey: true });

    const dialog = screen.getByRole("dialog", { name: "Поиск и команды" });
    expect(dialog).not.toBeNull();

    fireEvent.change(screen.getByPlaceholderText(/Найти раздел/), { target: { value: "калибров" } });
    const paletteList = dialog.querySelector(".command-palette__list") as HTMLElement;
    const results = within(paletteList).getAllByRole("option");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((link) => /калибров/i.test(link.textContent ?? ""))).toBe(true);

    fireEvent.keyDown(window, { key: "Escape" });
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

  it("moves a highlighted result with Up/Down and activates it with Enter", () => {
    mocks.routerPush.mockClear();
    render(<AppNavShell {...baseProps} />);

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const dialog = screen.getByRole("dialog", { name: "Поиск и команды" });
    const options = within(dialog).getAllByRole("option");
    expect(options.length).toBeGreaterThan(1);

    // First option starts highlighted.
    expect(options[0]?.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(dialog, { key: "ArrowDown" });
    const afterDown = within(dialog).getAllByRole("option");
    expect(afterDown[1]?.getAttribute("aria-selected")).toBe("true");
    expect(afterDown[0]?.getAttribute("aria-selected")).toBe("false");

    fireEvent.keyDown(dialog, { key: "Enter" });
    const expectedHref = afterDown[1]?.getAttribute("href");
    expect(mocks.routerPush).toHaveBeenCalledWith(expectedHref);
    expect(screen.queryByRole("dialog", { name: "Поиск и команды" })).toBeNull();
  });

  it("closes the palette when the backdrop is clicked", () => {
    render(<AppNavShell {...baseProps} />);

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.getByRole("dialog", { name: "Поиск и команды" })).not.toBeNull();

    const backdrop = document.querySelector(".command-palette") as HTMLElement;
    fireEvent.mouseDown(backdrop, { target: backdrop });
    expect(screen.queryByRole("dialog", { name: "Поиск и команды" })).toBeNull();
  });

  it("renders work-pulse counters as links", () => {
    render(<AppNavShell {...baseProps} />);

    const queueLink = screen.getByRole("link", { name: /Очередь/ });
    expect(queueLink.getAttribute("href")).toBe("/reviews?qaStatus=QUEUED");
  });

  it("submits logout through a native post form inside the identity menu", () => {
    render(<AppNavShell {...baseProps} />);

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

    // The disclosure menu is closed until the trigger is activated.
    expect(screen.queryByRole("menu", { name: "Основные разделы" })).toBeNull();
  });

  it("drops the burger trigger entirely when there are no visible areas", () => {
    render(<AppNavShell {...baseProps} areas={[]} />);

    // Пустой список областей не должен оставлять кнопку-огрызок «Разделы».
    expect(screen.queryByRole("button", { name: "Разделы" })).toBeNull();
    expect(document.querySelector(".app-nav__areas")).toBeNull();
  });

  it("opens and closes the mobile area menu and exposes the areas as menu links", () => {
    mocks.pathname = "/reviews/abc";
    render(<AppNavShell {...baseProps} />);

    const trigger = screen.getByRole("button", { name: "Разделы" });
    fireEvent.click(trigger);

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const menu = screen.getByRole("menu", { name: "Основные разделы" });
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
    expect(within(menu).getByRole("menuitem", { name: /Проверки/ }).getAttribute("aria-current")).toBe("page");

    // Escape closes the menu and returns aria-expanded to false.
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "Основные разделы" })).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes the mobile area menu when one of its links is chosen", () => {
    render(<AppNavShell {...baseProps} />);

    const trigger = screen.getByRole("button", { name: "Разделы" });
    fireEvent.click(trigger);
    const menu = screen.getByRole("menu", { name: "Основные разделы" });

    fireEvent.click(within(menu).getByRole("menuitem", { name: /Аналитика/ }));
    expect(screen.queryByRole("menu", { name: "Основные разделы" })).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("renders the demo switcher form bound to the switch action when provided", () => {
    render(
      <AppNavShell
        {...baseProps}
        demoSwitcher={{
          currentUserId: "user-1",
          roleLabel: "Администратор",
          users: [
            { id: "user-1", name: "Админ" },
            { id: "user-2", name: "Оператор" }
          ]
        }}
      />
    );

    const select = screen.getByRole("combobox", { name: "Демо-пользователь" }) as HTMLSelectElement;
    expect(select.getAttribute("name")).toBe("userId");
    expect(select.value).toBe("user-1");
    expect(screen.getByRole("button", { name: "Сменить" })).not.toBeNull();
  });
});
