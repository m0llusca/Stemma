import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  saveReviewDraft: vi.fn(),
  finalizeReview: vi.fn(),
  unstable_rethrow: vi.fn()
}));

vi.mock("next/navigation", () => ({
  unstable_rethrow: mocks.unstable_rethrow
}));

vi.mock("@/lib/review-actions", () => ({
  saveReviewDraft: mocks.saveReviewDraft,
  finalizeReview: mocks.finalizeReview
}));

function form(intent: "save" | "finalize") {
  const formData = new FormData();
  formData.set("intent", intent);
  return formData;
}

describe("submitReviewState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.saveReviewDraft.mockResolvedValue(undefined);
    mocks.finalizeReview.mockResolvedValue(undefined);
  });

  it("returns an ok success signal with a save message when the draft is saved without redirect", async () => {
    const { submitReviewState } = await import("@/lib/review-panel-actions");

    const state = await submitReviewState(null, form("save"));

    expect(state).toEqual({ ok: true, intent: "save", message: expect.stringContaining("Черновик") });
    expect(mocks.saveReviewDraft).toHaveBeenCalledOnce();
  });

  it("returns an ok success signal with a finalize message when the review is finalized without redirect", async () => {
    const { submitReviewState } = await import("@/lib/review-panel-actions");

    const state = await submitReviewState(null, form("finalize"));

    expect(state).toEqual({ ok: true, intent: "finalize", message: expect.stringContaining("Проверка") });
    expect(mocks.finalizeReview).toHaveBeenCalledOnce();
  });

  it("returns an error state when the underlying action throws a non-redirect error", async () => {
    mocks.saveReviewDraft.mockRejectedValue(new Error("Нет прав на сохранение черновиков."));
    const { submitReviewState } = await import("@/lib/review-panel-actions");

    const state = await submitReviewState(null, form("save"));

    expect(state).toEqual({ ok: false, message: "Нет прав на сохранение черновиков." });
    expect(mocks.unstable_rethrow).toHaveBeenCalledOnce();
  });
});
