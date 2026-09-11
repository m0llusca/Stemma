"use client";

import { useEffect, useState } from "react";

/** Entrance / update duration — Kinetics spring-enter (~550ms). */
export const chartSeriesAnimationDurationMs = 550;

/**
 * Prefer motion unless the user asked for reduced motion.
 * Defaults to `true` on first paint so SSR/hydration keep the entrance;
 * an effect flips it off when `prefers-reduced-motion: reduce` matches.
 */
export function useChartSeriesAnimationEnabled() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setEnabled(!media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return enabled;
}
