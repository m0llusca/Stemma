import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  requireCurrentUserPermission: vi.fn(),
  prisma: {
    savedQueueView: {
      create: vi.fn(),
      deleteMany: vi.fn()
    },
    conversation: {
      findFirst: vi.fn()
    }
  },
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  revalidatePath: vi.fn()
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect
}));

vi.mock("@/lib/current-user", () => ({
  canManageReviewWorkflow: (role: string) => role === "ADMIN" || role === "TEAM_LEAD",
  getCurrentUser: mocks.getCurrentUser,
  requireCurrentUserPermission: mocks.requireCurrentUserPermission
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

describe("queue view actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({
      id: "user-1",
      workspaceId: "workspace-1",
      role: "QA_ANALYST"
    });
    mocks.requireCurrentUserPermission.mockResolvedValue({
      id: "user-1",
      name: "Аналитик",
      workspaceId: "workspace-1",
      role: "QA_ANALYST"
    });
    mocks.prisma.savedQueueView.create.mockResolvedValue({ id: "view-1" });
    mocks.prisma.savedQueueView.deleteMany.mockResolvedValue({ count: 1 });
    mocks.prisma.conversation.findFirst.mockResolvedValue(null);
  });

  it("normalizes saved view hrefs to internal review URLs before redirecting", async () => {
    const { createSavedQueueView } = await import("@/lib/queue-view-actions");
    const formData = new FormData();
    formData.set("name", "Опасный редирект");
    formData.set("href", "https://evil.example/phish");

    await expect(createSavedQueueView(formData)).rejects.toThrow("NEXT_REDIRECT:/reviews");

    expect(mocks.prisma.savedQueueView.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        href: "/reviews",
        scope: "private"
      })
    });
    expect(mocks.redirect).toHaveBeenCalledWith("/reviews");
  });

  it("requires workflow permission to create workspace-wide queue views", async () => {
    const { createSavedQueueView } = await import("@/lib/queue-view-actions");
    const formData = new FormData();
    formData.set("name", "Командный вид");
    formData.set("href", "/reviews?process=critical");
    formData.set("scope", "workspace");

    await expect(createSavedQueueView(formData)).rejects.toThrow("Нет прав на общие представления очереди.");

    expect(mocks.prisma.savedQueueView.create).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("does not let non-managers delete workspace-wide queue views", async () => {
    const { deleteSavedQueueView } = await import("@/lib/queue-view-actions");
    const formData = new FormData();
    formData.set("id", "workspace-view");

    await deleteSavedQueueView(formData);

    expect(mocks.prisma.savedQueueView.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "workspace-view",
        workspaceId: "workspace-1",
        userId: "user-1"
      }
    });
  });

  it("opens the most urgent unreviewed conversation by SLA order", async () => {
    mocks.prisma.conversation.findFirst.mockResolvedValue({ id: "conv-7" });
    const { takeNextReview } = await import("@/lib/queue-view-actions");

    await expect(takeNextReview()).rejects.toThrow("NEXT_REDIRECT:/reviews/conv-7");

    expect(mocks.requireCurrentUserPermission).toHaveBeenCalledWith("reviews:read");
    expect(mocks.prisma.conversation.findFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace-1",
        qaStatus: { not: "FINALIZED" }
      },
      orderBy: [{ reviewDueAt: { sort: "asc", nulls: "last" } }, { openedAt: "desc" }],
      select: { id: true }
    });
    expect(mocks.redirect).toHaveBeenCalledWith("/reviews/conv-7");
  });

  it("scopes the next review to the support agent's own conversations", async () => {
    mocks.requireCurrentUserPermission.mockResolvedValue({
      id: "agent-1",
      name: "Оператор",
      workspaceId: "workspace-1",
      role: "SUPPORT_AGENT"
    });
    mocks.prisma.conversation.findFirst.mockResolvedValue({ id: "conv-own" });
    const { takeNextReview } = await import("@/lib/queue-view-actions");

    await expect(takeNextReview()).rejects.toThrow("NEXT_REDIRECT:/reviews/conv-own");

    expect(mocks.prisma.conversation.findFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace-1",
        qaStatus: { not: "FINALIZED" },
        assigneeName: "Оператор"
      },
      orderBy: [{ reviewDueAt: { sort: "asc", nulls: "last" } }, { openedAt: "desc" }],
      select: { id: true }
    });
  });

  it("redirects back to the queue when nothing is left to review", async () => {
    mocks.prisma.conversation.findFirst.mockResolvedValue(null);
    const { takeNextReview } = await import("@/lib/queue-view-actions");

    await expect(takeNextReview()).rejects.toThrow("NEXT_REDIRECT:/reviews?empty=1");

    expect(mocks.redirect).toHaveBeenCalledWith("/reviews?empty=1");
  });
});
