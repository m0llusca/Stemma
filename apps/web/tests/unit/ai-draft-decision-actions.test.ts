import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  decideAiQualityDraft: vi.fn(),
  getCurrentUser: vi.fn(),
  canSaveReviewDraft: vi.fn(),
  revalidatePath: vi.fn(),
  unstable_rethrow: vi.fn(),
  findFirst: vi.fn()
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath
}));

vi.mock("next/navigation", () => ({
  unstable_rethrow: mocks.unstable_rethrow
}));

vi.mock("@/lib/ai-quality/drafts", () => ({
  decideAiQualityDraft: mocks.decideAiQualityDraft
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
  canSaveReviewDraft: mocks.canSaveReviewDraft
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    aiQualityDraft: {
      findFirst: mocks.findFirst
    }
  }
}));

function form(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
}

describe("submitAiDraftDecision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({
      id: "qa-1",
      workspaceId: "workspace-1",
      role: "QA_ANALYST",
      name: "Проверяющий"
    });
    mocks.canSaveReviewDraft.mockReturnValue(true);
    mocks.findFirst.mockResolvedValue({ id: "draft-1", conversationId: "conversation-1" });
    mocks.decideAiQualityDraft.mockResolvedValue({ id: "draft-1", status: "approved" });
  });

  it("maps an approve intent to decideAiQualityDraft with the current user as actor", async () => {
    const { submitAiDraftDecision } = await import("@/lib/ai-quality/draft-decision-actions");

    const state = await submitAiDraftDecision(null, form({ draftId: "draft-1", decision: "approved" }));

    expect(mocks.decideAiQualityDraft).toHaveBeenCalledWith({
      draftId: "draft-1",
      decision: "approved",
      actorId: "qa-1",
      reason: undefined
    });
    expect(state).toEqual({ ok: true, decision: "approved", message: expect.stringContaining("принят") });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/reviews/conversation-1");
  });

  it("maps a reject intent and passes the reason through", async () => {
    const { submitAiDraftDecision } = await import("@/lib/ai-quality/draft-decision-actions");

    await submitAiDraftDecision(null, form({ draftId: "draft-1", decision: "rejected", reason: "Оценка завышена" }));

    expect(mocks.decideAiQualityDraft).toHaveBeenCalledWith({
      draftId: "draft-1",
      decision: "rejected",
      actorId: "qa-1",
      reason: "Оценка завышена"
    });
  });

  it("maps a change intent and parses the changed value JSON", async () => {
    const { submitAiDraftDecision } = await import("@/lib/ai-quality/draft-decision-actions");

    await submitAiDraftDecision(
      null,
      form({
        draftId: "draft-1",
        decision: "changed",
        reason: "Скорректировал оценку",
        changedValueJson: JSON.stringify({ overallConfidence: 0.5, criteria: [], summary: "Правка" })
      })
    );

    expect(mocks.decideAiQualityDraft).toHaveBeenCalledWith({
      draftId: "draft-1",
      decision: "changed",
      actorId: "qa-1",
      reason: "Скорректировал оценку",
      changedValue: { overallConfidence: 0.5, criteria: [], summary: "Правка" }
    });
  });

  it("rejects unknown decision intents without calling the drafts service", async () => {
    const { submitAiDraftDecision } = await import("@/lib/ai-quality/draft-decision-actions");

    const state = await submitAiDraftDecision(null, form({ draftId: "draft-1", decision: "deleted" }));

    expect(mocks.decideAiQualityDraft).not.toHaveBeenCalled();
    expect(state).toEqual({ ok: false, message: expect.any(String) });
  });

  it("refuses the decision when the user lacks the AI-draft permission", async () => {
    mocks.canSaveReviewDraft.mockReturnValue(false);
    const { submitAiDraftDecision } = await import("@/lib/ai-quality/draft-decision-actions");

    const state = await submitAiDraftDecision(null, form({ draftId: "draft-1", decision: "approved" }));

    expect(mocks.decideAiQualityDraft).not.toHaveBeenCalled();
    expect(state).toEqual({ ok: false, message: expect.any(String) });
  });

  it("refuses when the draft is outside the user's workspace", async () => {
    mocks.findFirst.mockResolvedValue(null);
    const { submitAiDraftDecision } = await import("@/lib/ai-quality/draft-decision-actions");

    const state = await submitAiDraftDecision(null, form({ draftId: "draft-1", decision: "approved" }));

    expect(mocks.decideAiQualityDraft).not.toHaveBeenCalled();
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "draft-1", workspaceId: "workspace-1" })
      })
    );
    expect(state).toEqual({ ok: false, message: expect.any(String) });
  });
});
