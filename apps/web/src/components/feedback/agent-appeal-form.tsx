"use client";

import { ToastActionForm } from "@/app/coaching/toast-action-form";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateReviewFeedbackState } from "@/lib/feedback-actions";
import { agentAppealNextSteps, type AgentAppealPhase } from "@/lib/feedback/agent-appeal";

type AgentAppealFormProps = {
  reviewId: string;
  allowed: boolean;
  disabledReason: string | null;
  phase: AgentAppealPhase;
  dueAt?: Date | null;
  criterionLabel?: string;
  /** Review-footer wording stays «Оспорить оценку»; deduction cards use «Апелляция». */
  triggerLabel?: string;
  formIdPrefix?: string;
};

/**
 * First-class appeal CTA for SUPPORT_AGENT. Visible when allowed; disabled +
 * reason when not. Failures stay on the form as an honest toast/alert.
 */
export function AgentAppealForm({
  reviewId,
  allowed,
  disabledReason,
  phase,
  dueAt,
  criterionLabel,
  triggerLabel = "Апелляция",
  formIdPrefix = "appeal"
}: AgentAppealFormProps) {
  const commentId = `${formIdPrefix}-comment-${reviewId}`;
  const placeholder = criterionLabel
    ? `Критерий «${criterionLabel}»: с чем не согласны и почему — со ссылкой на цитату, если есть.`
    : "С каким пунктом не согласны и почему — со ссылкой на цитату, если есть.";

  if (!allowed) {
    return (
      <div className="flex flex-col gap-1.5">
        <Button type="button" variant="outline" size="sm" disabled>
          {triggerLabel}
        </Button>
        <p className="text-xs text-muted-foreground">{disabledReason}</p>
        {phase !== "none" ? (
          <p className="text-xs text-muted-foreground">{agentAppealNextSteps({ phase, dueAt })}</p>
        ) : null}
      </div>
    );
  }

  return (
    <Collapsible className="rounded-lg border border-border bg-background data-open:bg-muted/20">
      <CollapsibleTrigger className="w-full cursor-pointer px-3 py-2 text-left text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {triggerLabel}
      </CollapsibleTrigger>
      <CollapsibleContent keepMounted>
        <ToastActionForm action={updateReviewFeedbackState} className="flex flex-col gap-2 border-t border-border p-3">
          <input type="hidden" name="reviewId" value={reviewId} />
          <input type="hidden" name="action" value="appeal_opened" />
          <p className="text-xs text-muted-foreground">
            Апелляция — рабочий разбор спорного пункта, не санкция. После отправки руководитель
            рассмотрит её в течение 2 дней. Статус сотрудника не меняется.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={commentId}>Обоснование</Label>
            <Textarea
              id={commentId}
              name="comment"
              rows={2}
              required
              placeholder={placeholder}
            />
          </div>
          <Button type="submit" variant="outline" size="sm">
            Открыть апелляцию
          </Button>
        </ToastActionForm>
      </CollapsibleContent>
    </Collapsible>
  );
}
