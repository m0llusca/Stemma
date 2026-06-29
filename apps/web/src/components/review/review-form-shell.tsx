"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useToast } from "@/components/ui/toast";
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

function FinalizeAndNextButton() {
  const { pending } = useFormStatus();

  return (
    <ValidatedSubmitButton name="intent" value="finalize_next" className="action-button" disabled={pending}>
      {pending ? "Завершаем..." : "Завершить и взять следующий"}
    </ValidatedSubmitButton>
  );
}

export function ReviewFormShell({ className, children }: { className?: string; children: ReactNode }) {
  const [state, formAction] = useActionState(submitReviewState, initialState);
  const toast = useToast();
  const messageRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!state) {
      return;
    }

    // Success is normally surfaced on the destination page after a redirect; this
    // covers the no-redirect fallback. Errors stay inline next to the actions so
    // the reviewer keeps the failed field in view (and the message is focused).
    if (state.ok) {
      toast.success(state.message);
    } else {
      messageRef.current?.focus();
    }
  }, [state, toast]);

  const errorState = state && !state.ok ? state : null;

  return (
    <form action={formAction} className={className}>
      {children}
      <div className="review-actions-bar">
        <SaveDraftButton />
        <FinalizeButton />
        <FinalizeAndNextButton />
        {errorState ? (
          <p ref={messageRef} tabIndex={-1} className="basis-full text-xs font-medium text-[var(--danger)]">
            {errorState.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
