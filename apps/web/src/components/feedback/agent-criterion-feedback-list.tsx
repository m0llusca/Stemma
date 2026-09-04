import Link from "next/link";
import type { AgentCriterionFeedbackItem } from "@/lib/feedback/agent-criterion-feedback";

type AgentCriterionFeedbackListProps = {
  items: AgentCriterionFeedbackItem[];
  /** When set, evidence rows link to the conversation detail message anchor. */
  conversationId?: string;
  /** Compact layout for inbox cards. */
  dense?: boolean;
};

/**
 * Calm per-deduction feedback: criterion result, evidence quote, and reviewer
 * «как лучше» comment when those fields already exist on the score.
 */
export function AgentCriterionFeedbackList({
  items,
  conversationId,
  dense = false
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
          <li
            key={item.id}
            className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="min-w-0 font-medium text-foreground">{item.label}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{item.resultLabel}</span>
            </div>

            {item.evidenceQuote ? (
              <blockquote className="mt-2 border-l-2 border-border pl-2.5 text-muted-foreground">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground/80">
                  Цитата из диалога
                </p>
                <p className="mt-1 text-sm leading-5 text-foreground">«{item.evidenceQuote}»</p>
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
            ) : evidenceHref ? (
              <p className="mt-2 text-xs text-muted-foreground">
                <Link href={evidenceHref} className="font-medium text-foreground underline-offset-4 hover:underline">
                  Открыть доказательство в диалоге
                </Link>
              </p>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Цитата в проверке не привязана.</p>
            )}

            {item.howToImprove ? (
              <div className="mt-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground/80">
                  Как лучше
                </p>
                <p className="mt-1 leading-5 text-foreground">{item.howToImprove}</p>
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Комментарий проверяющего по критерию пока не заполнен.
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
