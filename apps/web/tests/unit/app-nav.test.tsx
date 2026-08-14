import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getWorkspaceUsers: vi.fn(),
  isDemoAuthEnabled: vi.fn(),
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
  useRouter: () => ({ push: vi.fn() })
}));

vi.mock("@/lib/current-user", () => ({
  AuthRequiredError: class AuthRequiredError extends Error {},
  getCurrentUser: mocks.getCurrentUser,
  getWorkspaceUsers: mocks.getWorkspaceUsers,
  isDemoAuthEnabled: mocks.isDemoAuthEnabled
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("@/lib/user-actions", () => ({
  switchCurrentUser: mocks.switchCurrentUser
}));

function mockCurrentUser(role = "ADMIN") {
  mocks.getCurrentUser.mockResolvedValue({
    id: "user-1",
    workspaceId: "workspace-1",
    role,
    name: "Админ",
    email: "admin@example.com",
    workspace: {}
  });
  mocks.getWorkspaceUsers.mockResolvedValue([{ id: "user-1", name: "Админ", email: "admin@example.com", role }]);
  mocks.prisma.conversation.count.mockResolvedValue(0);
  mocks.prisma.review.count.mockResolvedValue(0);
  mocks.prisma.trainingAssignment.count.mockResolvedValue(0);
}

describe("app nav", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isDemoAuthEnabled.mockReturnValue(false);
    mockCurrentUser();
  });

  it("renders the primary product areas as top-nav links", async () => {
    const { AppNav } = await import("@/components/app-nav");

    render(await AppNav());

    const areaNav = screen.getByRole("navigation", { name: "Основные разделы" });
    const labels = within(areaNav)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(labels).toEqual(["Сегодня", "Проверки", "Калибровка", "Обучение", "Аналитика", "Настройки"]);
  });

  it("shows a support agent only permitted areas including its feedback page", async () => {
    mockCurrentUser("SUPPORT_AGENT");
    const { AppNav } = await import("@/components/app-nav");

    render(await AppNav());

    const areaNav = screen.getByRole("navigation", { name: "Основные разделы" });
    const labels = within(areaNav)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(labels).toEqual(["Сегодня", "Моя обратная связь", "Проверки", "Обучение"]);
  });

  it("hides the take-next-case shortcut from roles without reviews:write", async () => {
    mockCurrentUser("SUPPORT_AGENT");
    const { AppNav } = await import("@/components/app-nav");

    render(await AppNav());

    expect(screen.queryByRole("link", { name: "Взять следующий кейс" })).toBeNull();
  });

  it("surfaces the queue and coaching pulse links for a support agent", async () => {
    mockCurrentUser("SUPPORT_AGENT");
    const { AppNav } = await import("@/components/app-nav");

    render(await AppNav());

    // Имя «Рабочий пульс» делят два элемента: компактная мобильная кнопка меню
    // и десктоп-контейнер ссылок — ссылки проверяем внутри контейнера.
    const pulseSurfaces = screen.getAllByLabelText("Рабочий пульс");
    expect(pulseSurfaces).toHaveLength(2);
    const pulse = pulseSurfaces.find((element) => element.tagName === "DIV");
    expect(pulse).toBeDefined();
    expect(within(pulse!).getByRole("link", { name: /Очередь/ })).not.toBeNull();
    expect(within(pulse!).getByRole("link", { name: /Обучение/ })).not.toBeNull();
    // reviews:write отсутствует у SUPPORT_AGENT — быстрое действие скрыто.
    expect(screen.queryByRole("link", { name: "Взять следующий кейс" })).toBeNull();
  });

  it("hides every pulse link and the take-next-case shortcut from a viewer", async () => {
    mockCurrentUser("VIEWER");
    const { AppNav } = await import("@/components/app-nav");

    render(await AppNav());

    // Имя «Рабочий пульс» делят два элемента: компактная мобильная кнопка меню
    // и десктоп-контейнер ссылок — отсутствие ссылок проверяем в контейнере.
    const pulseSurfaces = screen.getAllByLabelText("Рабочий пульс");
    expect(pulseSurfaces).toHaveLength(2);
    const pulse = pulseSurfaces.find((element) => element.tagName === "DIV");
    expect(pulse).toBeDefined();
    // VIEWER без прав не должен видеть счётчики очереди/риска/обучения…
    expect(within(pulse!).queryByRole("link", { name: /Очередь/ })).toBeNull();
    expect(within(pulse!).queryByRole("link", { name: /Риск/ })).toBeNull();
    expect(within(pulse!).queryByRole("link", { name: /Обучение/ })).toBeNull();
    // …ни быстрое действие «Взять следующий кейс».
    expect(screen.queryByRole("link", { name: "Взять следующий кейс" })).toBeNull();
  });

  it("keeps the take-next-case shortcut for reviewers", async () => {
    const { AppNav } = await import("@/components/app-nav");

    render(await AppNav());

    expect(screen.getByRole("link", { name: "Взять следующий кейс" })).not.toBeNull();
  });

  it("keeps the demo switcher hidden when demo auth is disabled", async () => {
    mocks.isDemoAuthEnabled.mockReturnValue(false);
    const { AppNav } = await import("@/components/app-nav");

    render(await AppNav());

    expect(screen.queryByRole("button", { name: "Сменить" })).toBeNull();
    expect(mocks.isDemoAuthEnabled).toHaveBeenCalled();
  });

  it("surfaces the demo switcher with the switch action when demo auth is enabled", async () => {
    mocks.isDemoAuthEnabled.mockReturnValue(true);
    mocks.getWorkspaceUsers.mockResolvedValue([
      { id: "user-1", name: "Админ", email: "admin@example.com", role: "ADMIN" },
      { id: "user-2", name: "Оператор", email: "agent@example.com", role: "SUPPORT_AGENT" }
    ]);
    const { AppNav } = await import("@/components/app-nav");

    render(await AppNav());

    // Demo controls live in a DropdownMenu; open the identity menu first.
    const trigger = screen.getByRole("button", { name: /Администратор/i });
    fireEvent.click(trigger);

    expect(await screen.findByRole("button", { name: "Сменить" })).not.toBeNull();
    expect(screen.getByRole("combobox", { name: "Демо-пользователь" })).not.toBeNull();
  });

  it("queries the work-pulse counters for the global nav", async () => {
    const { AppNav } = await import("@/components/app-nav");

    await AppNav();

    expect(mocks.prisma.conversation.count).toHaveBeenCalled();
    expect(mocks.prisma.review.count).toHaveBeenCalled();
    expect(mocks.prisma.trainingAssignment.count).toHaveBeenCalled();
  });

  // The root layout renders AppNav on every route, including the login shell.
  // Suppressing workspace chrome there used to be a CSS concern
  // (`.page:has(.auth-shell) .app-nav { display: none }`); it is now the
  // component's own unauthenticated branch, so assert the behaviour directly.
  it("renders no workspace chrome while the unauthenticated login shell is up", async () => {
    const { AuthRequiredError } = await import("@/lib/current-user");
    mocks.getCurrentUser.mockRejectedValue(new AuthRequiredError());
    const { AppNav } = await import("@/components/app-nav");

    expect(await AppNav()).toBeNull();
    // No chrome also means no pulse queries for an anonymous visitor.
    expect(mocks.prisma.conversation.count).not.toHaveBeenCalled();
    expect(mocks.prisma.review.count).not.toHaveBeenCalled();
    expect(mocks.prisma.trainingAssignment.count).not.toHaveBeenCalled();
  });

  it("propagates non-auth failures instead of silently dropping the nav", async () => {
    mocks.getCurrentUser.mockRejectedValue(new Error("database is down"));
    const { AppNav } = await import("@/components/app-nav");

    await expect(AppNav()).rejects.toThrow("database is down");
  });
});
