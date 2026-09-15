"use client";

import { useRouter } from "next/navigation";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis
} from "recharts";
import {
  CHART_SERIES_STROKE,
  SCORE_OVER_TIME_MIN_HEIGHT_CLASS,
  SCORE_OVER_TIME_PLOT_HEIGHT
} from "@/components/charts/chart-visual-preset";
import type { SparklineDatum } from "@/components/reports/report-charts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from "@/components/ui/chart";
import { formatQualityScore } from "@/lib/score-display";
import { cn } from "@/lib/utils";

const chartConfig = {
  value: {
    label: "Средний балл",
    color: CHART_SERIES_STROKE
  }
} satisfies ChartConfig;

export function QualityWeekChart({
  points,
  target = 90
}: {
  points: SparklineDatum[];
  target?: number;
}) {
  const router = useRouter();
  const data = points.map((point) => ({
    ...point,
    value: point.value
  }));

  return (
    <ChartContainer
      id="dashboard-quality-week"
      config={chartConfig}
      role="img"
      aria-label="Тренд средней оценки"
      className={cn(SCORE_OVER_TIME_MIN_HEIGHT_CLASS, "aspect-auto w-full")}
      style={{ minHeight: SCORE_OVER_TIME_PLOT_HEIGHT }}
      initialDimension={{ width: 560, height: SCORE_OVER_TIME_PLOT_HEIGHT }}
    >
      <LineChart
        data={data}
        margin={{ top: 12, right: 12, left: 4, bottom: 4 }}
        accessibilityLayer={false}
      >
        <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.55} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval={0}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
        />
        <YAxis
          width={36}
          tickLine={false}
          axisLine={false}
          domain={["auto", "auto"]}
          tickFormatter={(value) => String(value)}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
        />
        <ReferenceLine
          y={target}
          stroke="color-mix(in srgb, var(--chart-2) 56%, var(--border))"
          strokeDasharray="6 6"
          label={{
            value: `Цель ${target}`,
            position: "insideTopRight",
            fill: "var(--muted-foreground)",
            fontSize: 11
          }}
        />
        <ChartTooltip
          cursor={{ stroke: "var(--border)", strokeDasharray: "4 4" }}
          content={
            <ChartTooltipContent
              formatter={(value) =>
                typeof value === "number" ? formatQualityScore(value) : "Нет данных"
              }
            />
          }
        />
        <Line
          type="monotone"
          dataKey="value"
          name="Средний балл"
          stroke="var(--color-value)"
          strokeWidth={2}
          connectNulls
          isAnimationActive={false}
          dot={{ r: 4, strokeWidth: 2, cursor: "pointer", fill: "var(--background)" }}
          activeDot={{
            r: 5,
            cursor: "pointer",
            onClick: (_event, payload) => {
              const href = (payload as { payload?: { href?: string } })?.payload?.href;
              if (href) {
                router.push(href);
              }
            }
          }}
        />
      </LineChart>
    </ChartContainer>
  );
}
