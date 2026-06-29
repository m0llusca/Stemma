import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppNavShell } from "@/components/app-nav-shell";
import { buildShellNavigation } from "@/lib/shell/navigation";

const mocks = vi.hoisted(() => ({
  pathname: "/reviews",
  switchCurrentUser: vi.fn()
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname
}));

vi.mock("@/lib/user-actions", () => ({
  switchCurrentUser: mocks.switchCurrentUser
}));

const navigation = buildShellNavigation({ role: "ADMIN" });
const baseProps = {
  navigation,
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
    const results = within(paletteList).getAllByRole("link");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((link) => /калибров/i.test(link.textContent ?? ""))).toBe(true);

    fireEvent.keyDown(window, { key: "Escape" });
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
