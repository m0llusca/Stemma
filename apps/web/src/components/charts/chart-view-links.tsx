"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { reportPageLocalLinkProps } from "@/lib/reports/report-evidence-links";
import { cn } from "@/lib/utils";

export type ChartView = "graph" | "table";

const reportAnalysisQueryKeys = new Set([
  "view",
  "period",
  "start",
  "end",
  "compare",
  "grain",
  "team",
  "source",
  "risk",
  "block",
  "section",
  "chartView",
  "series",
  "evidenceType",
  "evidenceKey"
]);

const requiredReportAnalysisQueryKeys = [
  "view",
  "period",
  "compare",
  "grain",
  "chartView",
  "series"
] as const;

export function eventTimeReportHref(eventHref: string, fallbackHref: string) {
  try {
    if (!eventHref.startsWith("/") || eventHref.startsWith("//")) {
      return fallbackHref;
    }

    const origin = "https://chart-view.local";
    const url = new URL(eventHref, origin);
    if (url.origin !== origin || url.pathname !== "/reports") {
      return fallbackHref;
    }

    const seen = new Set<string>();
    for (const key of url.searchParams.keys()) {
      if (seen.has(key) || !reportAnalysisQueryKeys.has(key)) {
        return fallbackHref;
      }
      seen.add(key);
    }

    if (requiredReportAnalysisQueryKeys.some((key) => !seen.has(key))) {
      return fallbackHref;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallbackHref;
  }
}

export function chartViewFromHref(href: string): ChartView | undefined {
  try {
    const value = new URL(href, "https://chart-view.local").searchParams.get(
      "chartView"
    );
    return value === "graph" || value === "table" ? value : undefined;
  } catch {
    return undefined;
  }
}

export function buildChartViewHref(currentHref: string, view: ChartView): string {
  if (!currentHref.startsWith("/") || currentHref.startsWith("//")) {
    throw new TypeError("Chart view href must be application-relative");
  }

  const origin = "https://chart-view.local";
  const url = new URL(currentHref, origin);
  if (url.origin !== origin) {
    throw new TypeError("Chart view href must stay on the application origin");
  }

  url.searchParams.set("chartView", view);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function chartViewLinkProps(currentHref: string, view: ChartView) {
  return {
    href: buildChartViewHref(currentHref, view),
    replace: true as const
  };
}

export function ChartViewLinks({
  currentHref,
  view,
  labelledBy
}: {
  currentHref: string;
  view: ChartView;
  labelledBy: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const hookHref = `${pathname}${search ? `?${search}` : ""}`;
  const candidateHref = eventTimeReportHref(hookHref, currentHref);
  const candidateView = chartViewFromHref(candidateHref);
  const liveHref = candidateView ? candidateHref : currentHref;
  const liveView = candidateView ?? chartViewFromHref(currentHref) ?? view;

  function commitView(
    event: MouseEvent<HTMLAnchorElement>,
    targetView: ChartView
  ) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      (event.currentTarget.target &&
        event.currentTarget.target !== "_self") ||
      event.currentTarget.hasAttribute("download")
    ) {
      return;
    }

    event.preventDefault();
    const eventHref =
      `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const sourceHref = eventTimeReportHref(eventHref, currentHref);
    const href = buildChartViewHref(sourceHref, targetView);
    window.history.replaceState(null, "", href);
    router.refresh();
  }

  return (
    <nav aria-labelledby={labelledBy} className="inline-flex items-center gap-1">
      {(
        [
          ["graph", "График"],
          ["table", "Таблица"]
        ] as const
      ).map(([targetView, label]) => {
        const active = targetView === liveView;
        const linkProps = chartViewLinkProps(liveHref, targetView);

        return (
          <Link
            key={targetView}
            {...linkProps}
            {...reportPageLocalLinkProps(linkProps.href)}
            aria-current={active ? "page" : undefined}
            onClick={(event) => commitView(event, targetView)}
            className={cn(
              buttonVariants({
                variant: active ? "secondary" : "ghost",
                size: "xs"
              })
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
