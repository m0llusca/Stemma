"use client";

import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { useFormStatus } from "react-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { submitAiDraftDecision, type AiDraftDecisionState } from "@/lib/ai-quality/draft-decision-actions";

const initialState: AiDraftDecisionState = null;

type AiDraftDecisionControlsProps = {
  draftId: string;
  /** Raw suggested-value JSON, pre-filled into the "Изменить" editor. */
  suggestedValueJson: string;
};

function DecisionButton({
  decision,
  variant,
  onSelectDecision,
  children
}: {
  decision: "approved" | "rejected" | "changed";
  variant: "default" | "destructive" | "outline";
  onSelectDecision: (decision: "approved" | "rejected" | "changed") => void;
  children: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      name="decision"
      value={decision}
      variant={variant}
      size="sm"
      disabled={pending}
      onClick={() => onSelectDecision(decision)}
    >
      {children}
    </Button>
  );
}

/**
 * Accept/reject/override controls for an AI "score" draft. Submits to
 * `submitAiDraftDecision`, which records the human decision via
 * `decideAiQualityDraft`. The "Изменить" disclosure reveals a JSON editor that
 * carries the corrected `ConversationScorePrediction` as `changedValueJson`.
 */
export function AiDraftDecisionControls({ draftId, suggestedValueJson }: AiDraftDecisionControlsProps) {
  const [state, formAction] = useActionState(submitAiDraftDecision, initialState);
  const toast = useToast();
  const messageRef = useRef<HTMLDivElement>(null);
  const decisionRef = useRef<"approved" | "rejected" | "changed" | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const reasonFieldId = `ai-draft-reason-${draftId}`;
  const changedValueFieldId = `ai-draft-changed-value-${draftId}`;

  useEffect(() => {
    if (!state) {
      return;
    }

    if (state.ok) {
      toast.success(state.message);
    } else {
      messageRef.current?.focus();
    }
  }, [state, toast]);

  // Client-side guard: the "Изменить" decision sends changedValueJson straight
  // to JSON.parse on the server, so block the submit early and say why inline.
  // Approve/reject never read the JSON and stay submittable. The decision is
  // tracked from the clicked button, so the guard never depends on
  // SubmitEvent.submitter support.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (decisionRef.current !== "changed") {
      return;
    }

    const raw = new FormData(event.currentTarget).get("changedValueJson");

    try {
      JSON.parse(String(raw ?? ""));
      setJsonError(null);
    } catch {
      event.preventDefault();
      setJsonError("Исправленное значение должно быть корректным JSON. Проверьте синтаксис перед отправкой.");
    }
  }

  const errorState = state && !state.ok ? state : null;

  return (
    <form action={formAction} onSubmit={handleSubmit} className="flex flex-col gap-3 border-t border-border pt-3">
      <input type="hidden" name="draftId" value={draftId} />

      <Field>
        <FieldLabel htmlFor={reasonFieldId}>Причина решения (необязательно)</FieldLabel>
        <Textarea
          id={reasonFieldId}
          name="reason"
          rows={2}
          className="min-h-14 text-sm"
          placeholder="Например: оценка завышена, тон был корректным."
        />
      </Field>

      <Collapsible className="group min-w-0">
        <CollapsibleTrigger className="cursor-pointer text-left text-sm font-medium text-primary">
          Изменить значение перед решением
        </CollapsibleTrigger>
        <CollapsibleContent keepMounted>
          <Field className="mt-2">
            <FieldLabel htmlFor={changedValueFieldId}>Исправленное значение (JSON)</FieldLabel>
            <Textarea
              id={changedValueFieldId}
              name="changedValueJson"
              rows={4}
              defaultValue={suggestedValueJson}
              className="min-h-24 font-mono text-sm"
              spellCheck={false}
            />
            <FieldDescription>
              Применяется только при нажатии «Изменить». Должно быть корректным JSON.
            </FieldDescription>
            {jsonError ? <FieldError>{jsonError}</FieldError> : null}
          </Field>
        </CollapsibleContent>
      </Collapsible>

      <div className="flex flex-wrap items-center gap-2">
        <DecisionButton
          decision="approved"
          variant="default"
          onSelectDecision={(value) => (decisionRef.current = value)}
        >
          Принять
        </DecisionButton>
        <DecisionButton
          decision="rejected"
          variant="destructive"
          onSelectDecision={(value) => (decisionRef.current = value)}
        >
          Отклонить
        </DecisionButton>
        <DecisionButton
          decision="changed"
          variant="outline"
          onSelectDecision={(value) => (decisionRef.current = value)}
        >
          Изменить
        </DecisionButton>
      </div>

      {errorState ? (
        <div ref={messageRef} tabIndex={-1} className="outline-none">
          <Alert variant="destructive">
            <AlertDescription>{errorState.message}</AlertDescription>
          </Alert>
        </div>
      ) : null}
    </form>
  );
}
