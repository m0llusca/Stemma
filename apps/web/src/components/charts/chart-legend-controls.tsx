"use client";

import { Button } from "@/components/ui/button";
import type { ChartSeries } from "@/lib/charts/contracts";
import { cn } from "@/lib/utils";

function applicationUrl(currentHref: string): URL {
  if (!currentHref.startsWith("/") || currentHref.startsWith("//")) {
    throw new TypeError("Chart series href must be application-relative");
  }

  const origin = "https://chart-series.local";
  const url = new URL(currentHref, origin);
  if (url.origin !== origin) {
    throw new TypeError("Chart series href must stay on the application origin");
  }

  return url;
}

export function buildChartSeriesHref<TKey extends string>(
  currentHref: string,
  orderedSeries: readonly TKey[],
  visibleSeries: readonly TKey[],
  toggledSeries: TKey
): string {
  const allowed = new Set(orderedSeries);
  if (
    orderedSeries.length === 0 ||
    allowed.size !== orderedSeries.length ||
    !allowed.has(toggledSeries) ||
    visibleSeries.some((key) => !allowed.has(key))
  ) {
    throw new TypeError("Chart series state contains an unsupported key");
  }

  const visible = new Set(visibleSeries);
  if (visible.has(toggledSeries)) {
    if (visible.size > 1) {
      visible.delete(toggledSeries);
    }
  } else {
    visible.add(toggledSeries);
  }

  const canonicalSeries = orderedSeries.filter((key) => visible.has(key));
  const url = applicationUrl(currentHref);
  url.searchParams.set("series", canonicalSeries.join(","));

  return `${url.pathname}${url.search}${url.hash}`;
}

const markerClassByKey: Record<string, string> = {
  score: "border-chart-1",
  previous: "border-chart-2 border-dashed",
  target: "border-chart-4 border-dotted",
  volume: "border-chart-3"
};

export function ChartLegendControls<TKey extends string>({
  series,
  visibleSeries,
  currentHref,
  ariaLabel = "Ряды графика"
}: {
  series: readonly ChartSeries<TKey>[];
  visibleSeries: readonly TKey[];
  currentHref: string;
  ariaLabel?: string;
}) {
  const visible = new Set(visibleSeries);
  const orderedKeys = series.map((item) => item.key);

  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {series.map((item) => {
        const pressed = visible.has(item.key);
        const isLastVisible = pressed && visible.size === 1;

        return (
          <Button
            key={item.key}
            type="button"
            variant={pressed ? "secondary" : "outline"}
            size="xs"
            aria-pressed={pressed}
            disabled={isLastVisible}
            onClick={() => {
              // Series visibility is presentation state owned by the URL. A
              // native replaceState commits it even when the App Router drops
              // navigation commits on a fresh page load (Next 16.2.x); the
              // parent chart re-renders from the updated search params.
              window.history.replaceState(
                null,
                "",
                buildChartSeriesHref(
                  currentHref,
                  orderedKeys,
                  visibleSeries,
                  item.key
                )
              );
            }}
          >
            <span
              aria-hidden="true"
              className={cn(
                "w-4 border-t-2",
                markerClassByKey[item.key] ?? "border-foreground"
              )}
            />
            {item.label}
          </Button>
        );
      })}
    </div>
  );
}
