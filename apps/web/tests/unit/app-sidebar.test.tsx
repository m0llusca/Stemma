import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getWorkspaceUsers: vi.fn(),
  isDemoAuthEnabled: vi.fn(),
  prisma: {
    conversation: {
      count: vi.fn(),
      findMany: vi.fn()
    },
    trainingAssignment: {
      count: vi.fn()
    }
  },
  switchCurrentUser: vi.fn()
}));

vi.mock("@/components/app-sidebar-shell", () => ({
  AppSidebarShell: ({ navigation }: { navigation: { modes: Array<{ href: string; label: string }> } }) => (
    <nav aria-label="Режимы системы">
      {navigation.modes.map((mode) => (
        <a key={mode.href} href={mode.href}>
          {mode.label}
        </a>
      ))}
    </nav>
  )
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

function mockCurrentUser() {
  mocks.getCurrentUser.mockResolvedValue({
    id: "user-1",
    workspaceId: "workspace-1",
    role: "SUPPORT_AGENT",
    name: "Оператор",
    email: "agent@example.com",
    workspace: {}
  });
  mocks.getWorkspaceUsers.mockResolvedValue([
    {
      id: "user-1",
      name: "Оператор",
      email: "agent@example.com",
      role: "SUPPORT_AGENT",
      supportLine: null,
      teamName: null
    }
  ]);
  mocks.prisma.conversation.count.mockResolvedValue(0);
  mocks.prisma.conversation.findMany.mockResolvedValue([]);
  mocks.prisma.trainingAssignment.count.mockResolvedValue(0);
}

describe("app sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isDemoAuthEnabled.mockReturnValue(false);
    mockCurrentUser();
  });

  it("does not block immediate shell rendering on sidebar signal counts", async () => {
    const { AppSidebar } = await import("@/components/app-sidebar");
    await AppSidebar();

    expect(mocks.prisma.conversation.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.conversation.count).not.toHaveBeenCalled();
    expect(mocks.prisma.trainingAssignment.count).not.toHaveBeenCalled();
  });

  it("renders compact role-filtered mode navigation", async () => {
    const { AppSidebar } = await import("@/components/app-sidebar");

    render(await AppSidebar());

    expect(screen.getByRole("link", { name: "Сегодня" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "Работа" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "Команда" })).not.toBeNull();
    expect(screen.queryByRole("link", { name: "Система" })).toBeNull();
  });

  it("keeps demo user switching out of the sidebar shell", async () => {
    mocks.isDemoAuthEnabled.mockReturnValue(true);
    const { AppSidebar } = await import("@/components/app-sidebar");

    render(await AppSidebar());

    expect(screen.queryByRole("button", { name: "Сменить" })).toBeNull();
    expect(mocks.isDemoAuthEnabled).not.toHaveBeenCalled();
  });
});
