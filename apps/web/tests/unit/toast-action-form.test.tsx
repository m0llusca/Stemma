import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ToastProvider } from "@/components/ui/toast";
import { ToastActionForm } from "@/app/coaching/toast-action-form";
import type { FeedbackActionState } from "@/lib/feedback-actions";

function renderForm(action: (state: FeedbackActionState, formData: FormData) => Promise<FeedbackActionState>) {
  return render(
    <ToastProvider>
      <ToastActionForm action={action} aria-label="Тестовая форма">
        <button type="submit">Отправить</button>
      </ToastActionForm>
    </ToastProvider>
  );
}

describe("ToastActionForm", () => {
  it("raises a success toast with the action's message", async () => {
    const action = async (): Promise<FeedbackActionState> => ({
      ok: true,
      toast: "Оценка принята.",
      nonce: 1
    });

    renderForm(action);

    await act(async () => {
      fireEvent.click(screen.getByText("Отправить"));
    });

    await waitFor(() => {
      expect(screen.getByText("Оценка принята.")).toBeInTheDocument();
    });
    expect(document.querySelector('.toast[data-tone="success"]')).not.toBeNull();
  });

  it("renders an inline error and raises no toast on failure", async () => {
    const action = async (): Promise<FeedbackActionState> => ({
      ok: false,
      message: "Нет прав на работу с обратной связью."
    });

    renderForm(action);

    await act(async () => {
      fireEvent.click(screen.getByText("Отправить"));
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Нет прав на работу с обратной связью.");
    });
    expect(document.querySelector('.toast[data-tone="success"]')).toBeNull();
  });
});
