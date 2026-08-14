"use client";

import { Play } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ActionFlowGuard } from "@/components/action-flow-guard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { runIntegrationQueueState, type IntegrationQueueRunActionState } from "@/lib/integration-actions";

const initialState: IntegrationQueueRunActionState = null;

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="outline" disabled={pending}>
      <Play data-icon="inline-start" aria-hidden="true" />
      {pending ? "Запускаем очередь" : "Запустить очередь сейчас"}
    </Button>
  );
}

export function IntegrationQueueRunForm() {
  const [actionState, formAction] = useActionState(runIntegrationQueueState, initialState);
  // The bridged result feeds the alert when the client router drops the
  // action commit (Next 16.2.x); the healthy path is untouched.
  const [bridgedState, setBridgedState] = useState<IntegrationQueueRunActionState>(null);
  const state = bridgedState ?? actionState;
  const messageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state) {
      messageRef.current?.focus();
    }
  }, [state]);

  return (
    <form action={formAction} className="grid min-w-[230px] gap-1">
      <ActionFlowGuard
        onResult={(value) => {
          const result = value as IntegrationQueueRunActionState;
          if (result) setBridgedState(result);
        }}
      />
      <input type="hidden" name="limit" value="5" />
      <SubmitButton />
      {state ? (
        <div ref={messageRef} tabIndex={-1}>
          <Alert variant={state.ok ? "default" : "destructive"} className="py-1.5">
            <AlertDescription className="text-xs">{state.message}</AlertDescription>
          </Alert>
        </div>
      ) : null}
    </form>
  );
}
