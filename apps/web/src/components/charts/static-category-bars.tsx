"use client";

import Link from "next/link";
import type { KeyboardEvent } from "react";
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
  categoryBarDrillLabel,
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

function activateLinkOnSpace(event: KeyboardEvent<HTMLAnchorElement>) {
  if (event.key !== " " && event.key !== "Spacebar") {
    return;
  }

  event.preventDefault();
  event.currentTarget.click();
}

export function StaticCategoryBarPlot({
  id,
  bars,
  config = defaultConfig
}: {
  id: string;
  bars: readonly CategoryBarDatum[];
  config?: ChartConfig;
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
            className="recharts-surface pointer-events-none block h-full w-full"
            tabIndex={-1}
            viewBox={`0 0 ${plot.width} ${plot.height}`}
            preserveAspectRatio="none"
            data-animation-active="true"
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
                data-slot="category-bar"
                data-key={bar.key}
                data-href={bar.href}
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={bar.height}
                rx={6}
                fill={barFill[bar.tone]}
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
          {plot.bars.map((bar) => (
            <Link
              key={`${bar.key}:drill`}
              href={bar.href}
              data-slot="category-bar-drill"
              data-key={bar.key}
              data-href={bar.href}
              aria-label={categoryBarDrillLabel(bar.label, bar.value)}
              className="absolute inset-y-0 -translate-x-1/2 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              style={{
                left: `${((bar.x + bar.width / 2) / plot.width) * 100}%`,
                width: `${Math.max(12, (bar.width / plot.width) * 100)}%`
              }}
              onKeyDown={activateLinkOnSpace}
            />
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
