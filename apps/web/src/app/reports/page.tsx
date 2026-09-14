import { Suspense } from "react";
import { PageSkeleton } from "@/components/loading-states";
import { ReportExportMenu } from "@/components/reports/report-command-bar";
import { ReportPageViews } from "@/components/reports/report-page-views";
import { PageShell } from "@/components/ui/page-shell";
import { loadReportPageModel } from "@/lib/reports/load-report-page-model";
import { formatPeriod } from "@/lib/reports/report-format";
import { requirePagePermission } from "@/lib/page-permission";

export const dynamic = "force-dynamic";

type ReportsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function ReportsPage({ searchParams }: ReportsPageProps) {
  return (
    <Suspense fallback={<PageSkeleton variant="reports" label="Загрузка аналитики качества" />}>
      <ReportsPageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ReportsPageContent({ searchParams }: ReportsPageProps) {
  const params = await searchParams;
  const user = await requirePagePermission("reports:read");
  const model = await loadReportPageModel({ user, searchParams: params });

  return (
    <PageShell
      title="Аналитика качества"
      description={`${model.activeView.description}. ${model.period.label}: ${formatPeriod(model.period)}.`}
      actions={<ReportExportMenu period={model.period} />}
      tabs={model.shellTabs}
      className="[&_[id]]:scroll-mt-[calc(var(--app-topbar-height)+4rem)]"
    >
      <ReportPageViews {...model} />
    </PageShell>
  );
}
