export type OpsEmptyTriage = {
  title: string;
  description: string;
  tone: "accent";
  actionLabel: string;
};

/**
 * Lead/Analyst empty triage: no focus signals is an observation, not a
 * certificate that quality or SLA is fine. Matches Exec empty honesty.
 */
export function buildOpsEmptyTriage(): OpsEmptyTriage {
  return {
    title: "Нет сигналов за период",
    description:
      "В текущих срезах нет просроченного SLA, высокого риска и застрявшей очереди — это не сертификат «всё в порядке». Откройте очередь, чтобы проверить объём.",
    tone: "accent",
    actionLabel: "Открыть очередь"
  };
}
