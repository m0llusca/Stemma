"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import {
  EXEC_RISK_CHART_MIN_HEIGHT_CLASS
} from "@/components/charts/chart-visual-preset";
import { useChartSeriesAnimationEnabled } from "@/lib/charts/series-animation";
import {
  CATEGORY_BAR_VIEWBOX,
  categoryBarDrillLabel,
  type CategoryBarDatum,
  type CategoryBarTone
} from "@/lib/charts/category-bar-geometry";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";

const barFill: Record<CategoryBarTone, string> = {
  danger: "var(--destructive)",
  warning: "var(--warning)",
  neutral: "var(--muted-foreground)"
};

const defaultConfig = {
  value: {
    label: "Проверки",
    color: "var(--muted-foreground)"
  }
} satisfies ChartConfig;

export function StaticCategoryBarPlot({
  id,
  bars,
  config = defaultConfig
}: {
  id: string;
  bars: readonly CategoryBarDatum[];
  config?: ChartConfig;
}) {
  const router = useRouter();
  const animationActive = useChartSeriesAnimationEnabled();
  const data = bars.map((bar) => ({
    ...bar,
    fill: barFill[bar.tone]
  }));

  return (
    <div data-slot="static-category-bars" className="grid min-w-0 gap-2">
      <ChartContainer
        id={id}
        config={config}
        data-animation-active={animationActive ? "true" : "false"}
        className={cn(EXEC_RISK_CHART_MIN_HEIGHT_CLASS, "w-full")}
        initialDimension={{
          width: CATEGORY_BAR_VIEWBOX.width,
          height: CATEGORY_BAR_VIEWBOX.height
        }}
      >
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, left: 4, bottom: 4 }}
          accessibilityLayer={false}
        >
          <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.55} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          />
          <YAxis
            width={28}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          />
          <ChartTooltip
            cursor={{ fill: "color-mix(in srgb, var(--muted) 55%, transparent)" }}
            content={<ChartTooltipContent />}
          />
          <Bar
            dataKey="value"
            name="Проверки"
            radius={[6, 6, 0, 0]}
            maxBarSize={72}
            isAnimationActive={animationActive}
            onClick={(item) => {
              const href = (item as { href?: string; payload?: { href?: string } }).href
                ?? (item as { payload?: { href?: string } }).payload?.href;
              if (href) {
                router.push(href);
              }
            }}
          >
            {data.map((bar) => (
              <Cell
                key={bar.key}
                fill={bar.fill}
                cursor="pointer"
                data-slot="category-bar"
                data-key={bar.key}
                data-href={bar.href}
              />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
      <div
        data-slot="category-bar-x-axis"
        className="grid min-w-0 gap-1 text-center text-[11px] leading-snug"
        style={{ gridTemplateColumns: `repeat(${Math.max(bars.length, 1)}, minmax(0, 1fr))` }}
      >
        {bars.map((bar) => (
          <Link
            key={bar.key}
            href={bar.href}
            data-slot="category-bar-drill"
            data-key={bar.key}
            data-href={bar.href}
            aria-label={categoryBarDrillLabel(bar.label, bar.value)}
            className="min-w-0 text-balance text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {bar.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
