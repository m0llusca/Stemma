import { StaticCategoryBarPlot } from "@/components/charts/static-category-bars";
import type { ChartConfig } from "@/components/ui/chart-container";
import type { ExecRiskChartBar } from "@/lib/dashboard/exec-risk-home";

const chartConfig = {
  overdue: {
    label: "Просрочено SLA",
    color: "var(--destructive)"
  },
  highRisk: {
    label: "Высокий риск",
    color: "var(--chart-5)"
  },
  queued: {
    label: "Очередь без старта",
    color: "var(--warning)"
  },
  value: {
    label: "Проверки",
    color: "var(--muted-foreground)"
  }
} satisfies ChartConfig;

/** Lead SLA bars share the static SVG painter — not the Exec client island. */
export function LeadSlaChart({ bars }: { bars: readonly ExecRiskChartBar[] }) {
  const summary = bars.map((bar) => `${bar.label}: ${bar.value}`).join(". ");

  return (
    <div data-slot="lead-sla-chart">
      <p className="sr-only">{summary}</p>
      <StaticCategoryBarPlot id="lead-sla" bars={bars} config={chartConfig} />
    </div>
  );
}
