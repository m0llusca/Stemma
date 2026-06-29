import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReviewFormShell } from "@/components/review/review-form-shell";
import { ToastProvider } from "@/components/ui/toast";
import { submitReviewState } from "@/lib/review-panel-actions";

vi.mock("@/lib/review-panel-actions", () => ({
  submitReviewState: vi.fn()
}));

// ReviewFormShell now surfaces grading success via useToast, so renders need a
// ToastProvider in scope (the live region is mounted globally in app layout).
function renderWithToast(ui: ReactNode) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

describe("ReviewFormShell", () => {
  beforeEach(() => {
    vi.mocked(submitReviewState).mockReset();
  });

  it("показывает сообщение об ошибке рядом с кнопками, если действие завершилось неудачей", async () => {
    vi.mocked(submitReviewState).mockResolvedValue({
      ok: false,
      message: "Проверка изменилась. Обновите страницу и повторите действие."
    });

    renderWithToast(
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

    renderWithToast(
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

    renderWithToast(
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

  it("передает intent=finalize_next для «Завершить и взять следующий»", async () => {
    vi.mocked(submitReviewState).mockResolvedValue(null);

    renderWithToast(
      <ReviewFormShell>
        <input type="hidden" name="conversationId" value="conv-1" />
      </ReviewFormShell>
    );

    fireEvent.click(screen.getByRole("button", { name: "Завершить и взять следующий" }));

    await waitFor(() => {
      expect(vi.mocked(submitReviewState)).toHaveBeenCalledTimes(1);
    });

    const formData = vi.mocked(submitReviewState).mock.calls[0]?.[1] as FormData;

    expect(formData.get("intent")).toBe("finalize_next");
  });

  it("показывает тост при успешном сохранении без редиректа", async () => {
    vi.mocked(submitReviewState).mockResolvedValue({
      ok: true,
      intent: "save",
      message: "Черновик проверки сохранён."
    });

    renderWithToast(
      <ReviewFormShell>
        <input type="hidden" name="conversationId" value="conv-1" />
      </ReviewFormShell>
    );

    fireEvent.click(screen.getByRole("button", { name: "Сохранить черновик" }));

    expect(await screen.findByText("Черновик проверки сохранён.")).toBeInTheDocument();
  });
});
