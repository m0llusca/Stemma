"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ActionFlowGuard } from "@/components/action-flow-guard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { queueIntegrationImportState, type IntegrationImportActionState } from "@/lib/integration-actions";

const initialState: IntegrationImportActionState = null;

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="link" size="sm" className="h-auto px-0" disabled={pending}>
      {pending ? "Ставим в очередь" : label}
    </Button>
  );
}

export function IntegrationImportQueueForm({
  integrationId,
  label = "Запланировать импорт"
}: {
  integrationId: string;
  label?: string;
}) {
  const [actionState, formAction] = useActionState(queueIntegrationImportState, initialState);
  // The bridged result feeds the alert when the client router drops the
  // action commit (Next 16.2.x); the healthy path is untouched.
  const [bridgedState, setBridgedState] = useState<IntegrationImportActionState>(null);
  const state = bridgedState ?? actionState;
  const messageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state) {
      messageRef.current?.focus();
    }
  }, [state]);

  return (
    <form action={formAction} className="mt-1 grid gap-1">
      <ActionFlowGuard
        onResult={(value) => {
          const result = value as IntegrationImportActionState;
          if (result) setBridgedState(result);
        }}
      />
      <input type="hidden" name="integrationId" value={integrationId} />
      <SubmitButton label={label} />
      {state ? (
        <div ref={messageRef} tabIndex={-1}>
          <Alert variant={state.ok ? "default" : "destructive"} className="py-1.5">
            <AlertDescription className="text-xs">
              {state.message}
              {state.ok && state.jobId ? ` Задача: ${state.jobId.slice(0, 8)}.` : ""}
            </AlertDescription>
          </Alert>
        </div>
      ) : null}
    </form>
  );
}
