"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { ActionFlowGuard } from "@/components/action-flow-guard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { ValidatedSubmitButton } from "@/components/ui/validated-submit-button";
import { cn } from "@/lib/utils";
import { submitReviewState, type ReviewPanelActionState } from "@/lib/review-panel-actions";

const initialState: ReviewPanelActionState = null;

function SaveDraftButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" name="intent" value="save" formNoValidate variant="outline" disabled={pending}>
      {pending ? "Сохраняем..." : "Сохранить черновик"}
    </Button>
  );
}

function FinalizeButton() {
  const { pending } = useFormStatus();

  return (
    <ValidatedSubmitButton
      name="intent"
      value="finalize"
      disabled={pending}
      className={cn(buttonVariants({ variant: "default" }))}
    >
      {pending ? "Завершаем..." : "Завершить проверку"}
    </ValidatedSubmitButton>
  );
}

function FinalizeAndNextButton() {
  const { pending } = useFormStatus();

  return (
    <ValidatedSubmitButton
      name="intent"
      value="finalize_next"
      disabled={pending}
      className={cn(buttonVariants({ variant: "secondary" }))}
    >
      {pending ? "Завершаем..." : "Завершить и взять следующий"}
    </ValidatedSubmitButton>
  );
}

export function ReviewFormShell({ className, children }: { className?: string; children: ReactNode }) {
  const [actionState, formAction] = useActionState(submitReviewState, initialState);
  // The bridged result covers the inline error state when the client router
  // drops the action commit (Next 16.2.x); the redirect fallback is handled
  // by the guard either way.
  const [bridgedState, setBridgedState] = useState<ReviewPanelActionState>(null);
  const state = bridgedState ?? actionState;
  const toast = useToast();
  const messageRef = useRef<HTMLDivElement>(null);

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
      <ActionFlowGuard
        onResult={(value) => {
          const result = value as ReviewPanelActionState;
          if (result) setBridgedState(result);
        }}
      />
      {children}
      <div className="review-actions-bar flex flex-wrap items-center gap-2 border-t border-border bg-muted/40 px-4 py-3">
        <SaveDraftButton />
        <FinalizeButton />
        <FinalizeAndNextButton />
        {errorState ? (
          <div ref={messageRef} tabIndex={-1} className="basis-full outline-none">
            <Alert variant="destructive">
              <AlertDescription>{errorState.message}</AlertDescription>
            </Alert>
          </div>
        ) : null}
      </div>
    </form>
  );
}
