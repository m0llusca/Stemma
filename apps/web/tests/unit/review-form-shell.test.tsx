import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReviewFormShell } from "@/components/review/review-form-shell";
import { submitReviewState } from "@/lib/review-panel-actions";

vi.mock("@/lib/review-panel-actions", () => ({
  submitReviewState: vi.fn()
}));

describe("ReviewFormShell", () => {
  beforeEach(() => {
    vi.mocked(submitReviewState).mockReset();
  });

  it("показывает сообщение об ошибке рядом с кнопками, если действие завершилось неудачей", async () => {
    vi.mocked(submitReviewState).mockResolvedValue({
      ok: false,
      message: "Проверка изменилась. Обновите страницу и повторите действие."
    });

    render(
      <ReviewFormShell>
        <input type="hidden" name="conversationId" value="conv-1" />
      </ReviewFormShell>
    );

    expect(screen.queryByText("Проверка изменилась. Обновите страницу и повторите действие.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Сохранить черновик" }));

    expect(await screen.findByText("Проверка изменилась. Обновите страницу и повторите действие.")).toBeInTheDocument();
  });

  it("не показывает сообщение, если действие завершилось успешно", async () => {
    vi.mocked(submitReviewState).mockResolvedValue(null);

    render(
      <ReviewFormShell>
        <input type="hidden" name="conversationId" value="conv-1" />
      </ReviewFormShell>
    );

    fireEvent.click(screen.getByRole("button", { name: "Сохранить черновик" }));

    await waitFor(() => {
      expect(vi.mocked(submitReviewState)).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText(/Не удалось/)).not.toBeInTheDocument();
  });

  it("передает intent=finalize при завершении проверки", async () => {
    vi.mocked(submitReviewState).mockResolvedValue(null);

    render(
      <ReviewFormShell>
        <input type="hidden" name="conversationId" value="conv-1" />
      </ReviewFormShell>
    );

    fireEvent.click(screen.getByRole("button", { name: "Завершить проверку" }));

    await waitFor(() => {
      expect(vi.mocked(submitReviewState)).toHaveBeenCalledTimes(1);
    });

    const formData = vi.mocked(submitReviewState).mock.calls[0]?.[1] as FormData;

    expect(formData.get("intent")).toBe("finalize");
    expect(formData.get("conversationId")).toBe("conv-1");
  });
});
