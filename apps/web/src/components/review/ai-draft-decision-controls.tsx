"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
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
  className,
  children
}: {
  decision: "approved" | "rejected" | "changed";
  className: string;
  children: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" name="decision" value={decision} className={className} disabled={pending}>
      {children}
    </button>
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
  const messageRef = useRef<HTMLParagraphElement>(null);

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

  const errorState = state && !state.ok ? state : null;

  return (
    <form action={formAction} className="ai-draft-decision">
      <input type="hidden" name="draftId" value={draftId} />

      <label className="ai-draft-decision__field">
        <span className="ai-draft-decision__label">Причина решения (необязательно)</span>
        <textarea
          name="reason"
          rows={2}
          className="form-control text-sm"
          placeholder="Например: оценка завышена, тон был корректным."
        />
      </label>

      <details className="ai-draft-decision__override">
        <summary className="ai-draft-decision__override-summary">Изменить значение перед решением</summary>
        <label className="ai-draft-decision__field">
          <span className="ai-draft-decision__label">Исправленное значение (JSON)</span>
          <textarea
            name="changedValueJson"
            rows={4}
            defaultValue={suggestedValueJson}
            className="form-control text-sm font-mono"
            spellCheck={false}
          />
          <span className="ai-draft-decision__hint">
            Применяется только при нажатии «Изменить». Должно быть корректным JSON.
          </span>
        </label>
      </details>

      <div className="ai-draft-decision__actions">
        <DecisionButton decision="approved" className="action-button action-button--primary">
          Принять
        </DecisionButton>
        <DecisionButton decision="rejected" className="action-button action-button--danger">
          Отклонить
        </DecisionButton>
        <DecisionButton decision="changed" className="action-button">
          Изменить
        </DecisionButton>
      </div>

      {errorState ? (
        <p ref={messageRef} tabIndex={-1} className="ai-draft-decision__error">
          {errorState.message}
        </p>
      ) : null}
    </form>
  );
}
