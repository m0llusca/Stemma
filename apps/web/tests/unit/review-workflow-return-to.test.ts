import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    conversation: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn()
    },
    review: {
      findFirst: vi.fn()
    },
    reviewEvent: {
      findFirst: vi.fn()
    }
  };

  return {
    auditLog: vi.fn(),
    canManageReviewWorkflow: vi.fn(),
    getCurrentUser: vi.fn(),
    prisma: {
      $transaction: vi.fn(),
      conversation: {
        findMany: vi.fn()
      },
      user: {
        findFirst: vi.fn()
      }
    },
    recordReviewEvent: vi.fn(),
    redirect: vi.fn(),
    revalidatePath: vi.fn(),
    tx
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect
}));

vi.mock("@/lib/audit", () => ({
  auditLog: mocks.auditLog
}));

vi.mock("@/lib/current-user", () => ({
  canManageReviewWorkflow: mocks.canManageReviewWorkflow,
  getCurrentUser: mocks.getCurrentUser
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("@/lib/review-events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/review-events")>();
  return {
    ...actual,
    recordReviewEvent: mocks.recordReviewEvent
  };
});

describe("bulkUpdateReviewQueue returnTo sanitization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx));
    mocks.getCurrentUser.mockResolvedValue({
      id: "manager-1",
      workspaceId: "workspace-1",
      role: "QA_ANALYST",
      name: "Менеджер"
    });
    mocks.canManageReviewWorkflow.mockReturnValue(true);
    // next/navigation redirect aborts the action by throwing.
    mocks.redirect.mockImplementation((href: string) => {
      throw new Error(`NEXT_REDIRECT:${href}`);
    });
  });

  it("collapses absolute external returnTo to / before redirect", async () => {
    const { bulkUpdateReviewQueue } = await import("@/lib/review-workflow-actions");
    const formData = new FormData();
    formData.set("returnTo", "https://evil.example/reviews");

    await expect(bulkUpdateReviewQueue(formData)).rejects.toThrow("NEXT_REDIRECT:/");
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });

  it("collapses protocol-relative returnTo to / before redirect", async () => {
    const { bulkUpdateReviewQueue } = await import("@/lib/review-workflow-actions");
    const formData = new FormData();
    formData.set("returnTo", "//evil.example");

    await expect(bulkUpdateReviewQueue(formData)).rejects.toThrow("NEXT_REDIRECT:/");
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });

  it("preserves a relative returnTo with query filters", async () => {
    const { bulkUpdateReviewQueue } = await import("@/lib/review-workflow-actions");
    const formData = new FormData();
    formData.set("returnTo", "/reviews?x=1&due=overdue");

    await expect(bulkUpdateReviewQueue(formData)).rejects.toThrow("NEXT_REDIRECT:/reviews?x=1&due=overdue");
    expect(mocks.redirect).toHaveBeenCalledWith("/reviews?x=1&due=overdue");
  });

  it("defaults missing returnTo to /reviews", async () => {
    const { bulkUpdateReviewQueue } = await import("@/lib/review-workflow-actions");
    const formData = new FormData();

    await expect(bulkUpdateReviewQueue(formData)).rejects.toThrow("NEXT_REDIRECT:/reviews");
    expect(mocks.redirect).toHaveBeenCalledWith("/reviews");
  });
});
