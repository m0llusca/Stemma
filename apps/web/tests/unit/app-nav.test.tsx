import { render, screen, within } from "@testing-library/react";
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
  usePathname: () => "/dashboard"
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

    expect(screen.getByRole("button", { name: "Сменить" })).not.toBeNull();
    expect(screen.getByRole("combobox", { name: "Демо-пользователь" })).not.toBeNull();
  });

  it("queries the work-pulse counters for the global nav", async () => {
    const { AppNav } = await import("@/components/app-nav");

    await AppNav();

    expect(mocks.prisma.conversation.count).toHaveBeenCalled();
    expect(mocks.prisma.review.count).toHaveBeenCalled();
    expect(mocks.prisma.trainingAssignment.count).toHaveBeenCalled();
  });
});
