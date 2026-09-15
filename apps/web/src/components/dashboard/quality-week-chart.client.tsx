"use client";

import { InteractiveSparklineChart } from "@/components/reports/interactive-sparkline-chart";
import type { SparklineDatum } from "@/components/reports/report-charts";

/** Lead/Admin week trend — reports static SVG sparkline, not a Recharts plot. */
export function QualityWeekChart({
  points,
  target = 90
}: {
  points: SparklineDatum[];
  target?: number;
}) {
  return <InteractiveSparklineChart points={points} target={target} />;
}
