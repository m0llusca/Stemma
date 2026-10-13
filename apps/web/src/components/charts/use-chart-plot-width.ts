"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

/** One measured width drives both the SVG geometry and its interaction layer. */
export function useChartPlotWidth(ref: RefObject<HTMLElement | null>, initialWidth: number) {
  const [width, setWidth] = useState(initialWidth);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = (value: number) => {
      if (Number.isFinite(value) && value > 0) setWidth(Math.max(1, Math.round(value)));
    };
    update(node.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) update(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
