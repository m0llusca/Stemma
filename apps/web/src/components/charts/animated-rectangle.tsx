"use client";

import type { ComponentProps } from "react";
import { Rectangle } from "recharts";
import {
  chartSeriesAnimationDurationMs,
  useChartSeriesAnimationEnabled
} from "@/lib/charts/series-animation";

type AnimatedRectangleProps = ComponentProps<typeof Rectangle>;

/**
 * Recharts `Rectangle` with series animation on by default.
 * Honors `prefers-reduced-motion` via {@link useChartSeriesAnimationEnabled}.
 */
export function AnimatedRectangle(props: AnimatedRectangleProps) {
  const enabled = useChartSeriesAnimationEnabled();

  return (
    <Rectangle
      {...props}
      isAnimationActive={enabled}
      isUpdateAnimationActive={enabled}
      animationDuration={chartSeriesAnimationDurationMs}
      animationEasing="ease-out"
    />
  );
}
