import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReviewKeyboard } from "@/components/review/review-keyboard";
import { REVIEW_FINALIZE_BLOCKED_HINT } from "@/lib/review/finalize-blocked";

function renderBlockedWorkbench() {
  const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());

  render(
    <form className="review-panel-form" onSubmit={onSubmit}>
      <div data-criterion-card>
        <input aria-label="Оценка" name="criterion.1.score" required defaultValue="" />
      </div>
      <button type="submit" name="intent" value="finalize_next" disabled>
        Завершить и взять следующий
      </button>
      <ReviewKeyboard />
    </form>
  );

  return { onSubmit };
}

describe("ReviewKeyboard blocked finalize", () => {
  it("focuses the first invalid control and announces when Cmd+Enter hits a disabled Finalize", () => {
    renderBlockedWorkbench();

    const firstInvalid = screen.getByLabelText("Оценка");
    expect(firstInvalid).not.toHaveFocus();

    fireEvent.keyDown(document, { key: "Enter", metaKey: true });

    expect(firstInvalid).toHaveFocus();
    const live = document.querySelector("[data-review-finalize-live]");
    expect(live).toHaveAttribute("aria-live", "assertive");
    expect(live).toHaveTextContent(REVIEW_FINALIZE_BLOCKED_HINT);
  });

  it("does the same for Ctrl+Enter and never submits a disabled Finalize", () => {
    const { onSubmit } = renderBlockedWorkbench();

    fireEvent.keyDown(document, { key: "Enter", ctrlKey: true });

    expect(screen.getByLabelText("Оценка")).toHaveFocus();
    expect(document.querySelector("[data-review-finalize-live]")).toHaveTextContent(
      REVIEW_FINALIZE_BLOCKED_HINT
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
