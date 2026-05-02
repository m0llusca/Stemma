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
    <section className="panel mb-5 overflow-hidden">
      <div className="grid gap-0 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="border-b border-[#d7dce5] bg-[#eef4f4] p-4 lg:border-b-0 lg:border-r">
          <p className="text-xs font-semibold uppercase text-[#667085]">Текущий шаг</p>
          <h2 className="mt-1 text-lg font-semibold text-[#17202a]">{steps[activeIndex].title}</h2>
          <p className="mt-1 text-sm text-[#475467]">{steps[activeIndex].detail}</p>
        </div>

        <ol className="grid divide-y divide-[#d7dce5] md:grid-cols-4 md:divide-x md:divide-y-0">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = index === activeIndex;
            const isDone = index < activeIndex || isReviewed;
            const toneClassName = isActive
              ? "border-[#116466] bg-white shadow-[inset_0_0_0_1px_#116466]"
              : isDone
                ? "border-transparent bg-white"
                : "border-transparent bg-[#fbfcfd]";
            const badgeClassName = isActive
              ? "bg-[#116466] text-white"
              : isDone
                ? "bg-[#e8f3ef] text-[#116466]"
                : "bg-[#eef4f4] text-[#667085]";

            return (
              <li key={step.title} className={`min-h-[88px] border p-4 ${toneClassName}`}>
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${badgeClassName}`}
                    aria-hidden="true"
                  >
                    <Icon className={iconClassName} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase text-[#667085]">Шаг {index + 1}</p>
                    <h3 className="mt-1 text-sm font-semibold text-[#17202a]">{step.title}</h3>
                    <p className="mt-1 truncate text-sm text-[#667085]">{step.detail}</p>
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
