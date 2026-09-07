"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";

import { useToast } from "@/components/ui/toast";
import type { FeedbackActionState } from "@/lib/feedback-actions";

type ToastActionFormAction = (
  state: FeedbackActionState,
  formData: FormData
) => Promise<FeedbackActionState>;

type ToastActionFormProps = {
  action: ToastActionFormAction;
  children: ReactNode;
  className?: string;
  /** Accessible name for the form region (kept off-screen visually). */
  "aria-label"?: string;
};

const initialState: FeedbackActionState = null;

/**
 * Client wrapper that posts a feedback/coaching `*State` server action through
 * `useActionState` and raises a success toast (and an inline error on failure)
 * without changing the underlying form markup, field names, or ARIA. The
 * server action still runs `revalidatePath`; the toast is the additive
 * confirmation the silent revalidate was missing.
 */
export function ToastActionForm({
  action,
  children,
  className,
  "aria-label": ariaLabel
}: ToastActionFormProps) {
  const [state, formAction] = useActionState(action, initialState);
  const toast = useToast();
  const lastNonceRef = useRef<number | null>(null);
  const lastErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (!state) {
      return;
    }

    if (state.ok) {
      if (state.nonce !== lastNonceRef.current) {
        lastNonceRef.current = state.nonce;
        lastErrorRef.current = null;
        toast.success(state.toast);
      }
      return;
    }

    if (state.message !== lastErrorRef.current) {
      lastErrorRef.current = state.message;
      toast.error(state.message);
    }
  }, [state, toast]);

  return (
    <form action={formAction} className={className} aria-label={ariaLabel}>
      {children}
      {state && !state.ok ? (
        <p role="alert" className="mt-2 text-xs font-medium text-destructive">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
