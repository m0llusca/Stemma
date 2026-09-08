"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
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

type BarClickPayload = {
  payload?: ExecRiskChartBar;
};

function isBarClickPayload(value: unknown): value is BarClickPayload {
  if (typeof value !== "object" || value === null || !("payload" in value)) {
    return false;
  }

  const payload = value.payload;
  if (typeof payload !== "object" || payload === null) {
    return false;
  }

  return "href" in payload && typeof payload.href === "string";
}

export function ExecRiskChart({ bars }: { bars: readonly ExecRiskChartBar[] }) {
  const router = useRouter();
  const summary = bars.map((bar) => `${bar.label}: ${bar.value}`).join(". ");

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
        className="h-[240px] w-full [&_.recharts-wrapper]:h-full [&_.recharts-wrapper]:w-full [&_.recharts-surface]:h-full [&_.recharts-surface]:w-full"
        initialDimension={{ width: EXEC_RISK_CHART_WIDTH, height: EXEC_RISK_CHART_HEIGHT }}
      >
        <BarChart
          accessibilityLayer
          width={EXEC_RISK_CHART_WIDTH}
          height={EXEC_RISK_CHART_HEIGHT}
          data={[...bars]}
          margin={{ left: 8, right: 8, top: 8, bottom: 0 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
          <Bar
            dataKey="value"
            name="value"
            radius={6}
            cursor="pointer"
            isAnimationActive={false}
            onClick={(data) => {
              if (isBarClickPayload(data)) {
                drillTo(data.payload.href);
              }
            }}
          >
            {bars.map((bar) => (
              <Cell
                key={bar.key}
                data-key={bar.key}
                data-href={bar.href}
                cursor="pointer"
                fill={barFill[bar.tone]}
                onClick={() => drillTo(bar.href)}
              />
            ))}
          </Bar>
        </BarChart>
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
