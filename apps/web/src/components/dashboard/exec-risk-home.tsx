import { ArrowRight, ClipboardCheck, Clock3, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { OperationKpiCard } from "@/components/operations/operation-kpi-card";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";
import { TriageStrip } from "@/components/ui/triage-strip";
import {
  buildExecRiskNarrative,
  type ExecRiskHrefSet,
  type ExecRiskSignal
} from "@/lib/dashboard/exec-risk-home";
import { semanticStatusForMetric } from "@/lib/ui/semantic-status";

const triageTone = {
  success: "success",
  warning: "warning",
  danger: "danger"
} as const;

export function ExecRiskHome({
  signal,
  hrefs,
  inWorkCount
}: {
  signal: ExecRiskSignal;
  hrefs: ExecRiskHrefSet;
  inWorkCount: number;
}) {
  const narrative = buildExecRiskNarrative(signal, hrefs);
  const overdueTone = semanticStatusForMetric({ kind: "overdue_count", value: signal.overdueReviewCount });
  const queueTone = semanticStatusForMetric({
    kind: "queue_count",
    value: signal.queuedCount + inWorkCount
  });
  const NarrativeIcon =
    signal.overdueReviewCount > 0 ? Clock3 : signal.highRiskCount > 0 ? TriangleAlert : ClipboardCheck;

  return (
    <PageShell
      className="dashboard-shell min-w-0"
      title="Риск"
      description="За 30 секунд — просроченный SLA и высокий риск, с переходом в очередь. Операционный хром скрыт."
    >
      <TriageStrip
        tone={triageTone[narrative.tone]}
        icon={<NarrativeIcon size={18} aria-hidden="true" />}
        title={narrative.title}
        description={narrative.description}
        action={
          <Button render={<Link href={narrative.primaryHref} />} nativeButton={false}>
            <span>{narrative.actionLabel}</span>
            <ArrowRight data-icon="inline-end" size={16} aria-hidden="true" />
          </Button>
        }
      />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Риск и SLA">
        <OperationKpiCard
          href={hrefs.overdue}
          icon={Clock3}
          value={signal.overdueReviewCount}
          tone={signal.overdueReviewCount > 0 ? "negative" : overdueTone.tone}
          label="Просрочено SLA"
          hint="открыть очередь с нарушенным сроком"
        />
        <OperationKpiCard
          href={hrefs.highRisk}
          icon={TriangleAlert}
          value={signal.highRiskCount}
          tone={signal.highRiskCount > 0 ? "negative" : "neutral"}
          label="Высокий риск"
          hint="за 30 дней · открыть проверки"
        />
        <OperationKpiCard
          href={hrefs.queued}
          icon={ClipboardCheck}
          value={signal.queuedCount}
          tone={queueTone.tone}
          label="Очередь без старта"
          hint={inWorkCount > 0 ? `${inWorkCount} уже в работе` : "ещё не взяли в проверку"}
        />
      </section>
    </PageShell>
  );
}
