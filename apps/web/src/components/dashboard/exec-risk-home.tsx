import { ArrowRight, ClipboardCheck, Clock3, TriangleAlert } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { RoleName } from "@prisma/client";
import { OperationKpiCard } from "@/components/operations/operation-kpi-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageShell } from "@/components/ui/page-shell";
import { TriageStrip } from "@/components/ui/triage-strip";
import {
  buildExecRiskChartModel,
  buildExecRiskNarrative,
  execRiskChartBarHref,
  type ExecRiskHrefSet,
  type ExecRiskSignal
} from "@/lib/dashboard/exec-risk-home";

const ExecRiskChart = dynamic(
  () =>
    import("@/components/dashboard/exec-risk-chart.client").then((mod) => mod.ExecRiskChart),
  {
    ssr: false,
    loading: () => (
      <div
        className="h-[240px] w-full rounded-lg bg-muted/40"
        aria-hidden="true"
        data-slot="exec-risk-chart-pending"
      />
    )
  }
);

const triageTone = {
  accent: "accent",
  warning: "warning",
  danger: "danger"
} as const;

export function ExecRiskHome({
  signal,
  hrefs,
  inWorkCount,
  role = "EXEC",
  name
}: {
  signal: ExecRiskSignal;
  hrefs: ExecRiskHrefSet;
  inWorkCount: number;
  role?: RoleName;
  name?: string;
}) {
  const chartInput = { signal, hrefs, role, name };
  const narrative = buildExecRiskNarrative(signal, hrefs);
  const chart = buildExecRiskChartModel(chartInput);
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
          href={execRiskChartBarHref("overdue", chartInput)}
          icon={Clock3}
          value={signal.overdueReviewCount}
          tone={signal.overdueReviewCount > 0 ? "negative" : "neutral"}
          label="Просрочено SLA"
          hint="открыть очередь с нарушенным сроком"
        />
        <OperationKpiCard
          href={execRiskChartBarHref("highRisk", chartInput)}
          icon={TriangleAlert}
          value={signal.highRiskCount}
          tone={signal.highRiskCount > 0 ? "negative" : "neutral"}
          label="Высокий риск"
          hint="за 30 дней · открыть проверки"
        />
        <OperationKpiCard
          href={execRiskChartBarHref("queued", chartInput)}
          icon={ClipboardCheck}
          value={signal.queuedCount}
          tone={signal.queuedCount > 0 ? "warning" : "neutral"}
          label="Очередь без старта"
          hint={inWorkCount > 0 ? `${inWorkCount} уже в работе` : "ещё не взяли в проверку"}
        />
      </section>

      <section aria-label="Сигналы риска">
        <Card size="sm">
          <CardHeader className="border-b">
            <CardTitle>Сигналы риска</CardTitle>
            <CardDescription>
              Те же срезы, что и у плиток — клик по столбцу открывает отфильтрованную очередь.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {chart.empty ? (
              <EmptyState
                size="inline"
                icon={<ClipboardCheck size={20} aria-hidden="true" />}
                title="Нет сигналов за период"
                description="Это не сертификат «всё в порядке». Откройте очередь без фильтра, чтобы проверить объём."
                action={
                  <Button render={<Link href={chart.resetHref} />} nativeButton={false} variant="outline" size="sm">
                    Открыть очередь без фильтра
                  </Button>
                }
              />
            ) : (
              <ExecRiskChart bars={chart.bars} />
            )}
          </CardContent>
        </Card>
      </section>
    </PageShell>
  );
}
