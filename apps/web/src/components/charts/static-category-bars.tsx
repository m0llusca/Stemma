"use client";

import {
  EXEC_RISK_CHART_MIN_HEIGHT_CLASS
} from "@/components/charts/chart-visual-preset";
import {
  StaticChartContainer,
  type ChartConfig
} from "@/components/ui/chart-container";
import {
  CATEGORY_BAR_MARGIN,
  CATEGORY_BAR_VIEWBOX,
  buildCategoryBarPlot,
  type CategoryBarDatum,
  type CategoryBarTone
} from "@/lib/charts/category-bar-geometry";
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
  config = defaultConfig,
  onBarClick
}: {
  id: string;
  bars: readonly CategoryBarDatum[];
  config?: ChartConfig;
  onBarClick: (href: string) => void;
}) {
  const plot = buildCategoryBarPlot(bars);
  const columnTemplate = `repeat(${Math.max(bars.length, 1)}, minmax(0, 1fr))`;

  return (
    <div data-slot="static-category-bars" className="grid min-w-0 gap-2">
      <div className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] items-stretch gap-x-2">
        <div
          aria-hidden="true"
          data-slot="category-bar-y-axis"
          className={cn("relative", EXEC_RISK_CHART_MIN_HEIGHT_CLASS)}
        >
          {plot.ticks.map((tick) => {
            const y =
              CATEGORY_BAR_MARGIN.top +
              plot.plotHeight * (1 - tick / plot.maxValue);

            return (
              <span
                key={tick}
                className="absolute right-0 -translate-y-1/2 text-[11px] tabular-nums text-muted-foreground"
                style={{ top: `${(y / plot.height) * 100}%` }}
              >
                {tick}
              </span>
            );
          })}
        </div>
        <StaticChartContainer
          id={id}
          config={config}
          className={cn(EXEC_RISK_CHART_MIN_HEIGHT_CLASS, "w-full")}
          initialDimension={{
            width: CATEGORY_BAR_VIEWBOX.width,
            height: CATEGORY_BAR_VIEWBOX.height
          }}
        >
          <svg
            aria-hidden="true"
            className="recharts-surface block h-full w-full"
            tabIndex={-1}
            viewBox={`0 0 ${plot.width} ${plot.height}`}
            preserveAspectRatio="none"
            data-animation-active="false"
          >
            {plot.ticks.map((tick) => {
              const y =
                CATEGORY_BAR_MARGIN.top +
                plot.plotHeight * (1 - tick / plot.maxValue);

              return (
                <line
                  key={tick}
                  x1={CATEGORY_BAR_MARGIN.left}
                  x2={plot.width - CATEGORY_BAR_MARGIN.right}
                  y1={y}
                  y2={y}
                  stroke="var(--border)"
                  strokeOpacity={0.55}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
            {plot.bars.map((bar) => (
              <rect
                key={bar.key}
                data-key={bar.key}
                data-href={bar.href}
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={bar.height}
                rx={6}
                fill={barFill[bar.tone]}
                className="cursor-pointer"
                onClick={() => onBarClick(bar.href)}
              />
            ))}
          </svg>
          {plot.bars.map((bar) => (
            <span
              key={`${bar.key}:value`}
              aria-hidden="true"
              data-slot="category-bar-value"
              className="pointer-events-none absolute -translate-x-1/2 text-[11px] font-semibold tabular-nums text-foreground"
              style={{
                left: `${((bar.x + bar.width / 2) / plot.width) * 100}%`,
                top: `${Math.max(4, ((bar.y - 16) / plot.height) * 100)}%`
              }}
            >
              {bar.value}
            </span>
          ))}
        </StaticChartContainer>
      </div>
      <div
        aria-hidden="true"
        data-slot="category-bar-x-axis"
        className="grid min-w-0 gap-1 pl-12 text-center text-[11px] leading-snug text-muted-foreground"
        style={{ gridTemplateColumns: columnTemplate }}
      >
        {bars.map((bar) => (
          <span key={bar.key} className="min-w-0 text-balance">
            {bar.label}
          </span>
        ))}
      </div>
    </div>
  );
}
