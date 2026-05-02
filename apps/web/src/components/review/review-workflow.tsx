import { AlertTriangle, ClipboardCheck, GraduationCap, MessagesSquare } from "lucide-react";

type ReviewWorkflowProps = {
  isReviewed: boolean;
  scorecardName: string;
  hasFinding: boolean;
  hasCoachingAction: boolean;
};

const iconClassName = "h-4 w-4";

export function ReviewWorkflow({ isReviewed, scorecardName, hasFinding, hasCoachingAction }: ReviewWorkflowProps) {
  const steps = [
    {
      title: "Контекст",
      detail: "Диалог и история сообщений",
      icon: MessagesSquare,
      tone: "done"
    },
    {
      title: "Оценка",
      detail: scorecardName,
      icon: ClipboardCheck,
      tone: isReviewed ? "done" : "active"
    },
    {
      title: "Находка",
      detail: hasFinding ? "Зафиксирована" : "Ожидает ввода",
      icon: AlertTriangle,
      tone: hasFinding ? "done" : "pending"
    },
    {
      title: "Коучинг",
      detail: hasCoachingAction ? "Действие создано" : "Опционально",
      icon: GraduationCap,
      tone: hasCoachingAction ? "done" : "pending"
    }
  ];

  return (
    <section className="panel mb-6 overflow-hidden">
      <div className="grid divide-y divide-[#d7dce5] md:grid-cols-4 md:divide-x md:divide-y-0">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const badgeClassName =
            step.tone === "done"
              ? "bg-[#e8f3ef] text-[#116466]"
              : step.tone === "active"
                ? "bg-[#fff4ed] text-[#b54708]"
                : "bg-[#eef4f4] text-[#667085]";

          return (
            <div key={step.title} className="flex min-h-[92px] items-start gap-3 p-4">
              <span
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${badgeClassName}`}
                aria-hidden="true"
              >
                <Icon className={iconClassName} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase text-[#667085]">Шаг {index + 1}</p>
                <h2 className="mt-1 text-sm font-semibold text-[#17202a]">{step.title}</h2>
                <p className="mt-1 truncate text-sm text-[#667085]">{step.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
