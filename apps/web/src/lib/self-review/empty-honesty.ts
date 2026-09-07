import { russianPlural } from "@/lib/reports/report-format";

export type SelfReviewTriageTone = "accent" | "success" | "warning";

export type SelfReviewTriageInput = {
  pendingInboxCount: number;
  appealCount: number;
  openTrainingCount: number;
  overdueTrainingCount: number;
  inboxHref: string | null;
};

export type SelfReviewTriageAction = {
  label: string;
  href: string;
};

export type SelfReviewTriage = {
  tone: SelfReviewTriageTone;
  title: string;
  description: string;
  action: SelfReviewTriageAction | null;
};

export type TrainingAssignmentEmptyCopy = {
  title: string;
  description: string;
};

function trainingRemainingDescription(openTrainingCount: number): string {
  return `Осталось закрыть ${russianPlural(openTrainingCount, ["учебную задачу", "учебные задачи", "учебных задач"])} после разбора.`;
}

/**
 * Agent self-review triage. Success is allowed only when the inbox and
 * training queue are both clear. Open training is remaining work, not an
 * all-clear — even if no review response is pending.
 */
export function buildSelfReviewTriage(input: SelfReviewTriageInput): SelfReviewTriage {
  if (input.pendingInboxCount > 0) {
    return {
      tone: input.appealCount > 0 ? "warning" : "accent",
      title: `${russianPlural(input.pendingInboxCount, ["проверка ждёт", "проверки ждут", "проверок ждут"])} вашего ответа`,
      description:
        input.appealCount > 0
          ? `Среди них ${input.appealCount} с открытой апелляцией. Примите оценку или оспорьте конкретный пункт с обоснованием.`
          : "Примите оценку, если замечания понятны; спорный пункт можно оспорить.",
      action: input.inboxHref
        ? {
            label: "Ответить сейчас",
            href: input.inboxHref
          }
        : null
    };
  }

  if (input.openTrainingCount > 0) {
    return {
      tone: input.overdueTrainingCount > 0 ? "warning" : "accent",
      title: "Есть открытые учебные задачи",
      description: trainingRemainingDescription(input.openTrainingCount),
      action: {
        label: "К учебным задачам",
        href: "/coaching"
      }
    };
  }

  return {
    tone: "success",
    title: "Срочных ответов нет",
    description: "Новые финальные проверки и апелляции появятся здесь первыми.",
    action: null
  };
}

/**
 * Empty training list: never assigned is not the same as finished work.
 */
export function trainingAssignmentEmptyCopy(hasEverBeenAssigned: boolean): TrainingAssignmentEmptyCopy {
  if (!hasEverBeenAssigned) {
    return {
      title: "Задач пока нет",
      description: "Учебные разборы появятся, когда их назначит тимлид."
    };
  }

  return {
    title: "Открытых задач нет",
    description: "Все назначенные разборы закрыты."
  };
}
