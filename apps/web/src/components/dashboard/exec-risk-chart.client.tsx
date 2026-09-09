"use client";

import Link from "next/link";
import { StaticCategoryBarPlot } from "@/components/charts/static-category-bars";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
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

export function ExecRiskChart({ bars }: { bars: readonly ExecRiskChartBar[] }) {
  const summary = bars.map((bar) => `${bar.label}: ${bar.value}`).join(". ");

  return (
    <div
      data-slot="exec-risk-chart"
      className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,16rem)]"
    >
      <p className="sr-only">{summary}</p>
      <StaticCategoryBarPlot id="exec-risk" bars={bars} config={chartConfig} />

      <Table aria-label="Сводка риска и SLA">
        <TableCaption className="sr-only">
          Те же срезы, что и у плиток: клик открывает отфильтрованную очередь.
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Сигнал</TableHead>
            <TableHead scope="col" className="text-right">
              Кол-во
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bars.map((bar) => (
            <TableRow key={bar.key}>
              <TableHead scope="row">
                <Link
                  href={bar.href}
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {bar.label}
                </Link>
              </TableHead>
              <TableCell className="text-right tabular-nums">{bar.value}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
