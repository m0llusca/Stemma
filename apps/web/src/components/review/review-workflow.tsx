import { CheckCircle2, ClipboardCheck, FileText, MessagesSquare } from "lucide-react";

type ReviewWorkflowProps = {
  isReviewed: boolean;
  hasDraftReview: boolean;
  scorecardName: string;
};

const iconClassName = "h-4 w-4";

export function ReviewWorkflow({ isReviewed, hasDraftReview, scorecardName }: ReviewWorkflowProps) {
  const activeIndex = isReviewed ? 3 : hasDraftReview ? 2 : 1;
  const steps = [
    {
      title: "Диалог",
      detail: "Прочитать контекст",
      icon: MessagesSquare
    },
    {
      title: "Оценка",
      detail: scorecardName,
      icon: ClipboardCheck
    },
    {
      title: "Итог",
      detail: "Краткий вывод и категория",
      icon: FileText
    },
    {
      title: "Готово",
      detail: "Проверка завершена",
      icon: CheckCircle2
    }
  ];

  return (
    <section className="workflow-strip">
      <div className="grid gap-3 lg:grid-cols-[190px_minmax(0,1fr)] lg:items-center">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-[#667085]">Текущий шаг</p>
          <h2 className="mt-1 text-base font-semibold text-[#17202a]">
            Шаг {activeIndex + 1}. {steps[activeIndex].title}
          </h2>
          <p className="mt-1 truncate text-sm leading-5 text-[#475467]">{steps[activeIndex].detail}</p>
        </div>

        <ol className="workflow-strip__list sm:grid-cols-4">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = index === activeIndex;
            const isDone = index < activeIndex || isReviewed;
            const badgeClassName = isActive
              ? "workflow-step__badge workflow-step__badge--active"
              : isDone
                ? "workflow-step__badge workflow-step__badge--done"
                : "workflow-step__badge";

            return (
              <li
                key={step.title}
                className={`workflow-step ${isActive ? "workflow-step--active" : ""}`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={badgeClassName}
                    aria-hidden="true"
                  >
                    <Icon className={iconClassName} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase text-[#667085]">Шаг {index + 1}</p>
                    <h3 className="truncate text-sm font-semibold text-[#17202a]">{step.title}</h3>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
