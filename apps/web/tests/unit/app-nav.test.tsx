import { isValidElement, Suspense } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getDemoRoleSwitcher: vi.fn(),
  isAuthEntryRequest: vi.fn(),
  prisma: {
    conversation: {
      count: vi.fn()
    },
    review: {
      count: vi.fn()
    },
    trainingAssignment: {
      count: vi.fn()
    }
  },
  switchCurrentUser: vi.fn()
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn() })
}));

vi.mock("@/lib/auth/request-path", () => ({
  isAuthEntryRequest: mocks.isAuthEntryRequest
}));

vi.mock("@/lib/current-user", () => ({
  AuthRequiredError: class AuthRequiredError extends Error {},
  getCurrentUser: mocks.getCurrentUser
}));

vi.mock("@/lib/auth/demo-switcher", () => ({
  getDemoRoleSwitcher: mocks.getDemoRoleSwitcher,
  demoRoleSwitchFormData: (userId: string) => {
    const formData = new FormData();
    formData.set("userId", userId);
    return formData;
  }
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("@/lib/user-actions", () => ({
  switchCurrentUser: mocks.switchCurrentUser
}));

import { resetAccountMenuExpandedForTests } from "@/components/auth/demo-role-switch";

// Base UI dialog / cmdk rely on APIs missing from jsdom.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);
Element.prototype.scrollIntoView = vi.fn();

function mockCurrentUser(role = "ADMIN") {
  mocks.getCurrentUser.mockResolvedValue({
    id: "user-1",
    workspaceId: "workspace-1",
    role,
    name: "Админ",
    email: "admin@example.com",
    workspace: {}
  });
  mocks.getDemoRoleSwitcher.mockResolvedValue(null);
  mocks.prisma.conversation.count.mockResolvedValue(0);
  mocks.prisma.review.count.mockResolvedValue(0);
  mocks.prisma.trainingAssignment.count.mockResolvedValue(0);
}

describe("app nav", () => {
  beforeEach(() => {
    resetAccountMenuExpandedForTests();
    vi.clearAllMocks();
    mocks.isAuthEntryRequest.mockResolvedValue(false);
    mockCurrentUser();
  });

  it("renders the primary product areas as top-nav links", async () => {
    const { AppNavForTests: AppNav } = await import("@/components/app-nav");

    render(await AppNav());

    const areaNav = screen.getByRole("navigation", { name: "Основные разделы" });
    const labels = within(areaNav)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(labels).toEqual(["Сегодня", "Проверки", "Калибровка", "Обучение", "Аналитика", "Настройки"]);
  });

  
  it("returns shell chrome without awaiting work-pulse counters", async () => {
    const { AppNav } = await import("@/components/app-nav");
    const tree = await AppNav();

    expect(isValidElement(tree) && tree.type === Suspense).toBe(true);
    // Pulse/demo stay as nested async signals — not resolved before return.
    expect(mocks.prisma.conversation.count).not.toHaveBeenCalled();
    expect(mocks.prisma.review.count).not.toHaveBeenCalled();
    expect(mocks.prisma.trainingAssignment.count).not.toHaveBeenCalled();
    expect(mocks.getDemoRoleSwitcher).not.toHaveBeenCalled();
  });

  it("wraps the search-params-backed shell in a Suspense boundary", async () => {
    const { AppNav } = await import("@/components/app-nav");
    const tree = await AppNav();

    expect(isValidElement(tree) && tree.type === Suspense).toBe(true);
    expect(
      isValidElement(tree) && isValidElement((tree.props as { fallback?: unknown }).fallback)
    ).toBe(true);
  });

  it("points Сегодня and the brand mark at the mine+overdue inbox for a QA analyst", async () => {
    mockCurrentUser("QA_ANALYST");
    mocks.getCurrentUser.mockResolvedValue({
      id: "user-1",
      workspaceId: "workspace-1",
      role: "QA_ANALYST",
      name: "Анна QA",
      email: "qa@example.com",
      workspace: {}
    });
    const { AppNavForTests: AppNav } = await import("@/components/app-nav");

    render(await AppNav());

    const areaNav = screen.getByRole("navigation", { name: "Основные разделы" });
    const today = within(areaNav).getByRole("link", { name: /Сегодня/ });
    expect(today.getAttribute("href")).toBe(
      "/reviews?qaAssignee=%D0%90%D0%BD%D0%BD%D0%B0%20QA&due=overdue"
    );
    expect(screen.getByRole("link", { name: "КК поддержки" }).getAttribute("href")).toBe(
      "/reviews?qaAssignee=%D0%90%D0%BD%D0%BD%D0%B0%20QA&due=overdue"
    );
    expect(within(areaNav).getByRole("link", { name: /Проверки/ }).getAttribute("href")).toBe(
      "/reviews"
    );
    expect(within(areaNav).getByRole("link", { name: /Настройки/ }).getAttribute("href")).toBe("/admin");
  });

  it("keeps lead Сегодня and the brand mark on the dashboard pulse", async () => {
    mockCurrentUser("TEAM_LEAD");
    mocks.getCurrentUser.mockResolvedValue({
      id: "user-1",
      workspaceId: "workspace-1",
      role: "TEAM_LEAD",
      name: "Игорь",
      email: "lead@example.com",
      workspace: {}
    });
    const { AppNavForTests: AppNav } = await import("@/components/app-nav");

    render(await AppNav());

    const areaNav = screen.getByRole("navigation", { name: "Основные разделы" });
    expect(within(areaNav).getByRole("link", { name: /Сегодня/ }).getAttribute("href")).toBe(
      "/dashboard"
    );
    expect(screen.getByRole("link", { name: "КК поддержки" }).getAttribute("href")).toBe("/dashboard");
  });

  it("shows a support agent only permitted areas including its feedback page", async () => {
    mockCurrentUser("SUPPORT_AGENT");
    const { AppNavForTests: AppNav } = await import("@/components/app-nav");

    render(await AppNav());

    const areaNav = screen.getByRole("navigation", { name: "Основные разделы" });
    const labels = within(areaNav)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(labels).toEqual(["Моя обратная связь", "Обучение"]);
    expect(within(areaNav).getByRole("link", { name: /Моя обратная связь/ }).getAttribute("href")).toBe(
      "/self-review"
    );
    expect(screen.getByRole("link", { name: "КК поддержки" }).getAttribute("href")).toBe("/self-review");
    expect(screen.queryByRole("link", { name: "Сегодня" })).toBeNull();
    expect(within(areaNav).queryByRole("link", { name: /Проверки/ })).toBeNull();
  });

  it("hides the take-next-case shortcut from roles without reviews:write", async () => {
    mockCurrentUser("SUPPORT_AGENT");
    const { AppNavForTests: AppNav } = await import("@/components/app-nav");

    render(await AppNav());

    expect(screen.queryByRole("button", { name: "Взять следующий" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Взять следующий" })).toBeNull();
  });

  it("surfaces coaching pulse only for a support agent, not ops queue", async () => {
    mockCurrentUser("SUPPORT_AGENT");
    const { AppNavForTests: AppNav } = await import("@/components/app-nav");

    render(await AppNav());

    // Имя «Рабочий пульс» делят два элемента: компактная мобильная кнопка меню
    // и десктоп-контейнер ссылок — ссылки проверяем внутри контейнера.
    const pulseSurfaces = screen.getAllByLabelText("Рабочий пульс");
    expect(pulseSurfaces).toHaveLength(2);
    const pulse = pulseSurfaces.find((element) => element.tagName === "DIV");
    expect(pulse).toBeDefined();
    expect(within(pulse!).queryByRole("link", { name: /Очередь/ })).toBeNull();
    expect(within(pulse!).queryByRole("link", { name: /Риск/ })).toBeNull();
    expect(within(pulse!).getByRole("link", { name: /Обучение/ })).not.toBeNull();
    // reviews:write отсутствует у SUPPORT_AGENT — быстрое действие скрыто.
    expect(screen.queryByRole("button", { name: "Взять следующий" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Взять следующий" })).toBeNull();
    expect(mocks.prisma.conversation.count).not.toHaveBeenCalled();
    expect(mocks.prisma.review.count).not.toHaveBeenCalled();
    expect(mocks.prisma.trainingAssignment.count).toHaveBeenCalled();
  });

  it("keeps exec on risk pulse without take-next or training chrome", async () => {
    mockCurrentUser("EXEC");
    const { AppNavForTests: AppNav } = await import("@/components/app-nav");

    render(await AppNav());

    const areaNav = screen.getByRole("navigation", { name: "Основные разделы" });
    const labels = within(areaNav)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(labels).toEqual(["Сегодня", "Проверки", "Аналитика"]);

    // EXEC has no ops pulse items and no take-next — empty pulse chrome stays hidden.
    expect(screen.queryByLabelText("Рабочий пульс")).toBeNull();
    expect(screen.queryByRole("button", { name: "Взять следующий" })).toBeNull();
    expect(mocks.prisma.conversation.count).not.toHaveBeenCalled();
    expect(mocks.prisma.review.count).not.toHaveBeenCalled();
  });

  it("renders no workspace chrome for a viewer holding state", async () => {
    mockCurrentUser("VIEWER");
    const { AppNavForTests: AppNav } = await import("@/components/app-nav");

    expect(await AppNav()).toBeNull();
    expect(mocks.prisma.conversation.count).not.toHaveBeenCalled();
    expect(mocks.prisma.review.count).not.toHaveBeenCalled();
    expect(mocks.prisma.trainingAssignment.count).not.toHaveBeenCalled();
    expect(mocks.getDemoRoleSwitcher).not.toHaveBeenCalled();
  });

  it("keeps take-next available via ⌘K for reviewers, not the nav pulse chrome", async () => {
    const { AppNavForTests: AppNav } = await import("@/components/app-nav");

    render(await AppNav());

    expect(screen.queryByRole("button", { name: "Взять следующий" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Взять следующий" })).toBeNull();

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const dialog = screen.getByRole("dialog", { name: "Поиск и команды" });
    const input = screen.getByPlaceholderText(/Найти раздел/);
    fireEvent.change(input, { target: { value: "следующий кейс" } });
    expect(within(dialog).getByRole("option", { name: /Взять следующий/ })).not.toBeNull();
  });

  it("keeps the demo switcher hidden when demo auth is disabled", async () => {
    mocks.getDemoRoleSwitcher.mockResolvedValue(null);
    const { AppNavForTests: AppNav } = await import("@/components/app-nav");

    render(await AppNav());

    expect(screen.queryByRole("button", { name: "Сменить роль" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Профиль:/ }));
    expect(screen.queryByRole("menuitem", { name: /Демо/ })).toBeNull();
    expect(mocks.getDemoRoleSwitcher).toHaveBeenCalled();
  });

  it("surfaces the demo role switch only inside the profile menu when demo auth is enabled", async () => {
    mocks.getDemoRoleSwitcher.mockResolvedValue({
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
    });
    const { AppNavForTests: AppNav } = await import("@/components/app-nav");

    render(await AppNav());

    expect(screen.queryByRole("button", { name: "Сменить роль" })).toBeNull();
    const profile = screen.getByRole("button", { name: /Профиль: Администратор/ });
    fireEvent.click(profile);
    const details = profile.closest("details");
    if (details && !details.open) {
      details.open = true;
      fireEvent(details, new Event("toggle", { bubbles: true }));
    }
    expect(await screen.findByRole("menuitem", { name: "Оператор · Демо" })).not.toBeNull();
    expect(
      screen.getByRole("menuitem", { name: "Админ · Администратор · Демо" }).getAttribute("aria-disabled")
    ).toBe("true");
  });

  it("keeps the risk pulse badge neutral when the count is 0", async () => {
    mocks.prisma.review.count.mockResolvedValue(0);
    const { AppNavForTests: AppNav } = await import("@/components/app-nav");

    render(await AppNav());

    const pulseSurfaces = screen.getAllByLabelText("Рабочий пульс");
    const pulse = pulseSurfaces.find((element) => element.tagName === "DIV");
    expect(pulse).toBeDefined();
    const risk = within(pulse!).getByRole("link", { name: "Риск: 0" });
    expect(risk.querySelector('[class*="bg-destructive"]')).toBeNull();
    expect(risk.querySelector('[class*="text-destructive"]')).toBeNull();
  });

  it("marks the risk pulse destructive only when the count is above 0", async () => {
    mocks.prisma.review.count.mockResolvedValue(3);
    const { AppNavForTests: AppNav } = await import("@/components/app-nav");

    render(await AppNav());

    const pulseSurfaces = screen.getAllByLabelText("Рабочий пульс");
    const pulse = pulseSurfaces.find((element) => element.tagName === "DIV");
    expect(pulse).toBeDefined();
    const risk = within(pulse!).getByRole("link", { name: "Риск: 3" });
    expect(risk.querySelector('[class*="bg-destructive"]')).not.toBeNull();
  });

  it("queries the work-pulse counters for the global nav", async () => {
    const { AppNavForTests: AppNav } = await import("@/components/app-nav");

    await AppNav();

    expect(mocks.prisma.conversation.count).toHaveBeenCalled();
    expect(mocks.prisma.review.count).toHaveBeenCalled();
    expect(mocks.prisma.trainingAssignment.count).toHaveBeenCalled();
  });

  // The root layout renders AppNav on every route, including the login shell.
  // Suppressing workspace chrome there used to be a CSS concern
  // (`.page:has(.auth-shell) .app-nav { display: none }`); it is now the
  // component's own auth-route / unauthenticated branch.
  it("renders no workspace chrome while the unauthenticated login shell is up", async () => {
    const { AuthRequiredError } = await import("@/lib/current-user");
    mocks.getCurrentUser.mockRejectedValue(new AuthRequiredError());
    const { AppNavForTests: AppNav } = await import("@/components/app-nav");

    expect(await AppNav()).toBeNull();
    // No chrome also means no pulse queries for an anonymous visitor.
    expect(mocks.prisma.conversation.count).not.toHaveBeenCalled();
    expect(mocks.prisma.review.count).not.toHaveBeenCalled();
    expect(mocks.prisma.trainingAssignment.count).not.toHaveBeenCalled();
  });

  it("renders no workspace chrome on /auth/* even when demo fallback impersonates a user", async () => {
    mocks.isAuthEntryRequest.mockResolvedValue(true);
    mockCurrentUser();
    const { AppNavForTests: AppNav } = await import("@/components/app-nav");

    expect(await AppNav()).toBeNull();
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
    expect(mocks.getDemoRoleSwitcher).not.toHaveBeenCalled();
    expect(mocks.prisma.conversation.count).not.toHaveBeenCalled();
    expect(mocks.prisma.review.count).not.toHaveBeenCalled();
    expect(mocks.prisma.trainingAssignment.count).not.toHaveBeenCalled();
  });

  it("propagates non-auth failures instead of silently dropping the nav", async () => {
    mocks.getCurrentUser.mockRejectedValue(new Error("database is down"));
    const { AppNavForTests: AppNav } = await import("@/components/app-nav");

    await expect(AppNav()).rejects.toThrow("database is down");
  });
});
