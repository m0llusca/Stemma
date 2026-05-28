import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  prisma: {
    savedQueueView: {
      create: vi.fn(),
      deleteMany: vi.fn()
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
  getCurrentUser: mocks.getCurrentUser
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
    mocks.prisma.savedQueueView.create.mockResolvedValue({ id: "view-1" });
    mocks.prisma.savedQueueView.deleteMany.mockResolvedValue({ count: 1 });
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
});
