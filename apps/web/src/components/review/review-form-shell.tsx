"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { ValidatedSubmitButton } from "@/components/ui/validated-submit-button";
import { submitReviewState, type ReviewPanelActionState } from "@/lib/review-panel-actions";

const initialState: ReviewPanelActionState = null;

function SaveDraftButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" name="intent" value="save" formNoValidate className="action-button" disabled={pending}>
      {pending ? "Сохраняем..." : "Сохранить черновик"}
    </button>
  );
}

function FinalizeButton() {
  const { pending } = useFormStatus();

  return (
    <ValidatedSubmitButton name="intent" value="finalize" disabled={pending}>
      {pending ? "Завершаем..." : "Завершить проверку"}
    </ValidatedSubmitButton>
  );
}

export function ReviewFormShell({ className, children }: { className?: string; children: ReactNode }) {
  const [state, formAction] = useActionState(submitReviewState, initialState);
  const messageRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (state) {
      messageRef.current?.focus();
    }
  }, [state]);

  return (
    <form action={formAction} className={className}>
      {children}
      <div className="review-actions-bar">
        <SaveDraftButton />
        <FinalizeButton />
        {state ? (
          <p ref={messageRef} tabIndex={-1} className="basis-full text-xs font-medium text-[var(--danger)]">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
