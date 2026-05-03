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
    <section className="panel p-4">
      <div className="grid gap-4 lg:grid-cols-[210px_minmax(0,1fr)] lg:items-center">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-[#667085]">Текущий шаг</p>
          <h2 className="mt-1 text-base font-semibold text-[#17202a]">
            Шаг {activeIndex + 1}. {steps[activeIndex].title}
          </h2>
          <p className="mt-1 truncate text-sm leading-5 text-[#475467]">{steps[activeIndex].detail}</p>
        </div>

        <ol className="grid gap-2 sm:grid-cols-4">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = index === activeIndex;
            const isDone = index < activeIndex || isReviewed;
            const badgeClassName = isActive
              ? "bg-[#116466] text-white"
              : isDone
                ? "bg-[#e8f3ef] text-[#116466]"
                : "bg-[#eef4f4] text-[#667085]";

            return (
              <li
                key={step.title}
                className={`rounded-md px-2 py-2 ${isActive ? "bg-[#f7fbfa] ring-1 ring-[#116466]" : "bg-transparent"}`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${badgeClassName}`}
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
