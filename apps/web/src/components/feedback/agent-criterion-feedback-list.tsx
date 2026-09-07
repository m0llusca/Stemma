import Link from "next/link";
import { AgentAppealForm } from "@/components/feedback/agent-appeal-form";
import { Chip } from "@/components/ui/chip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@/components/ui/collapsible";
import type { AgentAppealPhase } from "@/lib/feedback/agent-appeal";
import { AGENT_QUOTE_UNAVAILABLE, type AgentCriterionFeedbackItem } from "@/lib/feedback/agent-criterion-feedback";

export type AgentCriterionAppealProps = {
  reviewId: string;
  allowed: boolean;
  disabledReason: string | null;
  phase: AgentAppealPhase;
  dueAt?: Date | null;
};

type AgentCriterionFeedbackListProps = {
  items: AgentCriterionFeedbackItem[];
  /** When set, evidence rows link to the conversation detail message anchor. */
  conversationId?: string;
  /** Compact layout for inbox cards. */
  dense?: boolean;
  /** Appeal CTA on each deduction; omit only when the surface has no review. */
  appeal?: AgentCriterionAppealProps;
};

/**
 * Calm per-deduction pack: цитата → снятие → как исправить → апелляция.
 * Collapsed header still shows criterion, impact, and that quote/fix exist.
 */
export function AgentCriterionFeedbackList({
  items,
  conversationId,
  dense = false,
  appeal
}: AgentCriterionFeedbackListProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <ul
      className={dense ? "flex flex-col gap-2" : "flex flex-col gap-3"}
      aria-label="Снижения по критериям"
    >
      {items.map((item) => {
        const evidenceHref =
          conversationId && item.evidenceMessageId
            ? `/reviews/${conversationId}#msg-${item.evidenceMessageId}`
            : null;

        return (
          <li key={item.id}>
            <Collapsible
              defaultOpen={!dense}
              className="rounded-lg border border-border bg-muted/30 data-open:bg-muted/40"
            >
              <CollapsibleTrigger className="flex w-full cursor-pointer flex-col gap-2 px-3 py-2.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="min-w-0 font-medium text-foreground">{item.label}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{item.impactLabel}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip tone={item.isCriticalFail ? "danger" : "warning"} size="xs">
                    {item.resultLabel}
                  </Chip>
                  <Chip tone="neutral" size="xs">
                    {item.hasQuote ? "есть цитата" : AGENT_QUOTE_UNAVAILABLE}
                  </Chip>
                  <Chip tone="neutral" size="xs">
                    {item.hasHowToFix ? "есть как исправить" : "нет шагов"}
                  </Chip>
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent keepMounted>
                <div className="flex flex-col gap-3 border-t border-border px-3 py-3 text-sm">
                  <section className="flex flex-col gap-1.5" aria-labelledby={`quote-${item.id}`}>
                    <h3
                      id={`quote-${item.id}`}
                      className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      Цитата
                    </h3>
                    {item.evidenceQuote ? (
                      <blockquote className="border-l-2 border-border pl-2.5">
                        <p className="leading-5 text-foreground">«{item.evidenceQuote}»</p>
                        {evidenceHref ? (
                          <p className="mt-1.5">
                            <Link
                              href={evidenceHref}
                              className="text-xs font-medium text-foreground underline-offset-4 hover:underline"
                            >
                              Открыть в диалоге
                            </Link>
                          </p>
                        ) : null}
                      </blockquote>
                    ) : (
                      <p className="text-muted-foreground">«{AGENT_QUOTE_UNAVAILABLE}»</p>
                    )}
                  </section>

                  <section className="flex flex-col gap-1.5" aria-labelledby={`impact-${item.id}`}>
                    <h3
                      id={`impact-${item.id}`}
                      className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      Снятие
                    </h3>
                    <p className="text-foreground">
                      {item.label}
                      <span className="tabular-nums text-muted-foreground"> · {item.impactLabel}</span>
                    </p>
                  </section>

                  <section className="flex flex-col gap-1.5" aria-labelledby={`fix-${item.id}`}>
                    <h3
                      id={`fix-${item.id}`}
                      className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      Как исправить
                    </h3>
                    <ol className="flex list-decimal flex-col gap-1.5 pl-4">
                      {item.howToFixSteps.map((step) => (
                        <li key={step.text} className="leading-5 text-foreground">
                          {step.href ? (
                            <Link href={step.href} className="underline-offset-4 hover:underline">
                              {step.text}
                            </Link>
                          ) : (
                            step.text
                          )}
                        </li>
                      ))}
                    </ol>
                  </section>

                  {appeal ? (
                    <section className="flex flex-col gap-1.5" aria-labelledby={`appeal-${item.id}`}>
                      <h3
                        id={`appeal-${item.id}`}
                        className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                      >
                        Апелляция
                      </h3>
                      <AgentAppealForm
                        reviewId={appeal.reviewId}
                        allowed={appeal.allowed}
                        disabledReason={appeal.disabledReason}
                        phase={appeal.phase}
                        dueAt={appeal.dueAt}
                        criterionLabel={item.label}
                        formIdPrefix={`deduction-${item.id}`}
                      />
                    </section>
                  ) : null}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </li>
        );
      })}
    </ul>
  );
}
