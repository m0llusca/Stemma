import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getWorkspaceUsers: vi.fn(),
  prisma: {
    conversation: {
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
  getWorkspaceUsers: mocks.getWorkspaceUsers
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("@/lib/user-actions", () => ({
  switchCurrentUser: mocks.switchCurrentUser
}));

describe("app sidebar", () => {
  it("counts only active-cycle finalized open appeals for badges", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "user-1",
      workspaceId: "workspace-1",
      role: "SUPPORT_AGENT",
      name: "Оператор"
    });
    mocks.getWorkspaceUsers.mockResolvedValue([]);
    mocks.prisma.conversation.count.mockResolvedValue(0);

    const { AppSidebar } = await import("@/components/app-sidebar");
    await AppSidebar();

    expect(mocks.prisma.conversation.count).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace-1",
        assigneeName: "Оператор",
        qaStatus: "FINALIZED",
        reviews: {
          some: {
            reviewSource: "HUMAN",
            status: "FINALIZED",
            appealStatus: "open"
          }
        }
      }
    });
  });
});
