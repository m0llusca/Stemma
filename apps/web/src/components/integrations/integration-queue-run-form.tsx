"use client";

import { Play } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { runIntegrationQueueState, type IntegrationQueueRunActionState } from "@/lib/integration-actions";

const initialState: IntegrationQueueRunActionState = null;

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="action-button" disabled={pending}>
      <Play size={16} aria-hidden="true" />
      {pending ? "Запускаем очередь" : "Запустить очередь сейчас"}
    </button>
  );
}

export function IntegrationQueueRunForm() {
  const [state, formAction] = useActionState(runIntegrationQueueState, initialState);
  const messageRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (state) {
      messageRef.current?.focus();
    }
  }, [state]);

  return (
    <form action={formAction} className="grid min-w-[230px] gap-1">
      <input type="hidden" name="limit" value="5" />
      <SubmitButton />
      {state ? (
        <p ref={messageRef} tabIndex={-1} className={`text-xs font-medium ${state.ok ? "text-[#166534]" : "text-[#b91c1c]"}`}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
