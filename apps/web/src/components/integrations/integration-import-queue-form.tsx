"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { queueIntegrationImportState, type IntegrationImportActionState } from "@/lib/integration-actions";

const initialState: IntegrationImportActionState = null;

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="quiet-link text-sm" disabled={pending}>
      {pending ? "Ставим в очередь" : "Запланировать импорт"}
    </button>
  );
}

export function IntegrationImportQueueForm({ integrationId }: { integrationId: string }) {
  const [state, formAction] = useActionState(queueIntegrationImportState, initialState);
  const messageRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (state) {
      messageRef.current?.focus();
    }
  }, [state]);

  return (
    <form action={formAction} className="mt-1 grid gap-1">
      <input type="hidden" name="integrationId" value={integrationId} />
      <SubmitButton />
      {state ? (
        <p
          ref={messageRef}
          tabIndex={-1}
          className={`text-xs font-medium ${state.ok ? "text-[#166534]" : "text-[var(--danger)]"}`}
        >
          {state.message}
          {state.ok && state.jobId ? ` Задача: ${state.jobId.slice(0, 8)}.` : ""}
        </p>
      ) : null}
    </form>
  );
}
