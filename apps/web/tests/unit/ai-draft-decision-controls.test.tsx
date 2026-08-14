import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiDraftDecisionControls } from "@/components/review/ai-draft-decision-controls";

const mocks = vi.hoisted(() => ({
  submitAiDraftDecision: vi.fn(async () => ({ ok: true as const, decision: "changed", message: "ok" })),
  toastSuccess: vi.fn()
}));

vi.mock("@/lib/ai-quality/draft-decision-actions", () => ({
  submitAiDraftDecision: mocks.submitAiDraftDecision
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ success: mocks.toastSuccess })
}));

const suggestedValueJson = JSON.stringify({ overallConfidence: 0.8, criteria: [], summary: "Черновик" });

describe("AiDraftDecisionControls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("associates the labels with the reason and changed-value textareas", () => {
    render(<AiDraftDecisionControls draftId="draft-1" suggestedValueJson={suggestedValueJson} />);

    expect(screen.getByLabelText("Причина решения (необязательно)")).toHaveAttribute("name", "reason");
    expect(screen.getByLabelText("Исправленное значение (JSON)")).toHaveAttribute("name", "changedValueJson");
  });

  it("blocks the «Изменить» submit with an inline Russian error when the JSON is invalid", async () => {
    render(<AiDraftDecisionControls draftId="draft-1" suggestedValueJson={suggestedValueJson} />);

    fireEvent.click(screen.getByRole("button", { name: "Изменить значение перед решением" }));
    fireEvent.change(screen.getByLabelText("Исправленное значение (JSON)"), {
      target: { value: "{ не json" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Изменить" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/корректным JSON/);
    expect(mocks.submitAiDraftDecision).not.toHaveBeenCalled();
  });

  it("submits the «Изменить» decision when the JSON is valid", async () => {
    render(<AiDraftDecisionControls draftId="draft-1" suggestedValueJson={suggestedValueJson} />);

    fireEvent.click(screen.getByRole("button", { name: "Изменить" }));

    await waitFor(() => {
      expect(mocks.submitAiDraftDecision).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("lets «Принять» through without touching the JSON guard", async () => {
    render(<AiDraftDecisionControls draftId="draft-1" suggestedValueJson={suggestedValueJson} />);

    fireEvent.change(screen.getByLabelText("Исправленное значение (JSON)"), {
      target: { value: "{ не json" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Принять" }));

    await waitFor(() => {
      expect(mocks.submitAiDraftDecision).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
