import type { ReactNode } from "react";
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
  AppSidebarShell: ({ children }: { children: ReactNode }) => <nav>{children}</nav>
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
    name: "Оператор"
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

  it("does not show the demo user switcher by default", async () => {
    const { AppSidebar } = await import("@/components/app-sidebar");

    render(await AppSidebar());

    expect(screen.queryByRole("button", { name: "Переключить" })).toBeNull();
  });

  it("shows the demo user switcher when demo auth is explicitly enabled", async () => {
    mocks.isDemoAuthEnabled.mockReturnValue(true);
    const { AppSidebar } = await import("@/components/app-sidebar");

    render(await AppSidebar());

    expect(screen.getByRole("button", { name: "Переключить" })).not.toBeNull();
  });
});
