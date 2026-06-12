"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export type StickyMetric = {
  icon?: ReactNode;
  value: ReactNode;
  label: string;
  tone?: "danger" | "success" | "warning";
};

/**
 * A thin metrics strip that stays out of the layout until the page header scrolls
 * past the sticky topbar, then appears fixed below it — so the key section counts
 * remain visible while the user scrolls a long list. Mirrors the reviews queue
 * sticky metrics, made reusable for every section with header metrics + a list.
 */
export function StickyMetricsBar({ items, ariaLabel }: { items: StickyMetric[]; ariaLabel: string }) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") {
      return;
    }

    const topbarHeight =
      Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--app-topbar-height")) || 0;

    const observer = new IntersectionObserver(
      ([entry]) => setShown(!entry.isIntersecting),
      { rootMargin: `-${Math.round(topbarHeight) + 1}px 0px 0px 0px`, threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  if (items.length === 0) {
    return null;
  }

  return (
    <>
      <div ref={sentinelRef} aria-hidden className="sticky-metrics-sentinel" />
      <div className={`sticky-metrics-bar ${shown ? "sticky-metrics-bar--shown" : ""}`} aria-label={ariaLabel} aria-hidden={!shown}>
        <div className="sticky-metrics-bar__inner">
          {items.map((item) => (
            <span key={item.label} className={`sticky-metric ${item.tone ? `sticky-metric--${item.tone}` : ""}`}>
              {item.icon}
              <strong>{item.value}</strong>
              {item.label}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
