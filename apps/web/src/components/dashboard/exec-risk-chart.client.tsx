"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  StaticChartContainer,
  type ChartConfig
} from "@/components/ui/chart-container";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
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

const barFill: Record<ExecRiskChartBar["tone"], string> = {
  danger: "var(--destructive)",
  warning: "var(--warning)",
  neutral: "var(--muted-foreground)"
};

const EXEC_RISK_CHART_WIDTH = 520;
const EXEC_RISK_CHART_HEIGHT = 240;
const EXEC_RISK_CHART_MARGIN = { left: 28, right: 8, top: 8, bottom: 36 } as const;

function execRiskPlot(bars: readonly ExecRiskChartBar[]) {
  const plotWidth =
    EXEC_RISK_CHART_WIDTH - EXEC_RISK_CHART_MARGIN.left - EXEC_RISK_CHART_MARGIN.right;
  const plotHeight =
    EXEC_RISK_CHART_HEIGHT - EXEC_RISK_CHART_MARGIN.top - EXEC_RISK_CHART_MARGIN.bottom;
  const maxValue = Math.max(1, ...bars.map((bar) => bar.value));
  const slot = plotWidth / Math.max(bars.length, 1);
  const barWidth = Math.min(72, slot * 0.55);
  const mid = Math.round(maxValue / 2);
  const ticks =
    mid === 0 || mid === maxValue ? [0, maxValue] : [0, mid, maxValue];

  return {
    plotHeight,
    maxValue,
    ticks,
    bars: bars.map((bar, index) => {
      const height = (bar.value / maxValue) * plotHeight;
      return {
        ...bar,
        x: EXEC_RISK_CHART_MARGIN.left + slot * index + (slot - barWidth) / 2,
        y: EXEC_RISK_CHART_MARGIN.top + plotHeight - height,
        width: barWidth,
        height
      };
    })
  };
}

export function ExecRiskChart({ bars }: { bars: readonly ExecRiskChartBar[] }) {
  const router = useRouter();
  const summary = bars.map((bar) => `${bar.label}: ${bar.value}`).join(". ");
  const plot = execRiskPlot(bars);

  function drillTo(href: string) {
    router.push(href);
  }

  return (
    <div
      data-slot="exec-risk-chart"
      className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,16rem)]"
    >
      <p className="sr-only">{summary}</p>
      <StaticChartContainer
        id="exec-risk"
        config={chartConfig}
        className="h-[240px] w-full"
        initialDimension={{ width: EXEC_RISK_CHART_WIDTH, height: EXEC_RISK_CHART_HEIGHT }}
      >
        <svg
          aria-hidden="true"
          className="recharts-surface block h-full w-full"
          tabIndex={-1}
          viewBox={`0 0 ${EXEC_RISK_CHART_WIDTH} ${EXEC_RISK_CHART_HEIGHT}`}
          preserveAspectRatio="none"
          data-animation-active="false"
        >
          {plot.ticks.map((tick) => {
            const y =
              EXEC_RISK_CHART_MARGIN.top +
              plot.plotHeight * (1 - tick / plot.maxValue);
            return (
              <g key={tick} aria-hidden="true">
                <line
                  x1={EXEC_RISK_CHART_MARGIN.left}
                  x2={EXEC_RISK_CHART_WIDTH - EXEC_RISK_CHART_MARGIN.right}
                  y1={y}
                  y2={y}
                  stroke="var(--border)"
                  strokeOpacity={0.55}
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={EXEC_RISK_CHART_MARGIN.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  fill="var(--muted-foreground)"
                  fontSize={11}
                >
                  {tick}
                </text>
              </g>
            );
          })}
          {plot.bars.map((bar) => (
            <g key={bar.key}>
              <rect
                data-key={bar.key}
                data-href={bar.href}
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={bar.height}
                rx={6}
                fill={barFill[bar.tone]}
                className="cursor-pointer"
                onClick={() => drillTo(bar.href)}
              />
              <text
                x={bar.x + bar.width / 2}
                y={EXEC_RISK_CHART_HEIGHT - 14}
                textAnchor="middle"
                fill="var(--muted-foreground)"
                fontSize={11}
              >
                {bar.label}
              </text>
            </g>
          ))}
        </svg>
      </StaticChartContainer>

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
