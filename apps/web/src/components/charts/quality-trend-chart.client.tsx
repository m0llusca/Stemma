"use client";

import {
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent
} from "react";
import { useRouter } from "next/navigation";
import { ChartLegendControls } from "@/components/charts/chart-legend-controls";
import { ChartTooltipStatus } from "@/components/charts/chart-tooltip-status";
import { DeferredChartVisual } from "@/components/charts/deferred-chart-visual.client";
import type { ChartModel } from "@/lib/charts/contracts";
import {
  buildQualityTrendGeometry,
  viewBoxPercent
} from "@/lib/charts/plot-geometry";
import {
  formatQualityScore,
  formatQualityScoreDelta,
  qualityScoreDelta
} from "@/lib/score-display";
import { openReportChartPointHref } from "@/lib/reports/report-evidence-links";

export type QualityTrendSeries =
  | "score"
  | "previous"
  | "target"
  | "volume";

const loadQualityTrendVisual = async () => {
  const module = await import("@/components/charts/recharts-visuals.client");
  return { default: module.QualityTrendVisual };
};

function reviewCountLabel(count: number | undefined): string {
  if (count == null) {
    return "Нет данных";
  }

  const lastTwo = count % 100;
  const last = count % 10;
  const word =
    lastTwo >= 11 && lastTwo <= 14
      ? "проверок"
      : last === 1
        ? "проверка"
        : last >= 2 && last <= 4
          ? "проверки"
          : "проверок";

  return `${count} ${word}`;
}

export function QualityTrendChart({
  model,
  visibleSeries,
  currentHref
}: {
  model: ChartModel<QualityTrendSeries>;
  visibleSeries: readonly QualityTrendSeries[];
  currentHref: string;
}) {
  const router = useRouter();
  const descriptionId = useId();
  const instructionsId = useId();
  const tooltipId = useId();
  const plotRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const geometry = useMemo(
    () => buildQualityTrendGeometry(model, visibleSeries),
    [model, visibleSeries]
  );
  const activePoint =
    activeIndex == null ? undefined : model.points[activeIndex];
  const score = activePoint?.values.score ?? null;
  const previous = activePoint?.values.previous ?? null;
  const delta = qualityScoreDelta(score, previous);
  const activeMark =
    activeIndex == null ? null : geometry.selectedMark(activeIndex);
  const activePosition = activeMark
    ? viewBoxPercent(activeMark, geometry.width, geometry.height)
    : null;
  const describedBy = activePoint
    ? `${descriptionId} ${instructionsId} ${tooltipId}`
    : `${descriptionId} ${instructionsId}`;

  function moveActive(deltaIndex: number) {
    if (model.points.length === 0) {
      return;
    }

    setActiveIndex((current) => {
      const start = current ?? 0;
      return Math.max(0, Math.min(model.points.length - 1, start + deltaIndex));
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveActive(1);
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveActive(-1);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setActiveIndex(null);
      return;
    }
    if (event.key === "Enter" && activePoint?.href) {
      event.preventDefault();
      openReportChartPointHref(router.push, activePoint.href);
    }
  }

  function handleFocus() {
    if (activeIndex == null && model.points.length > 0) {
      setActiveIndex(0);
    }
  }

  function handlePointer(event: PointerEvent<HTMLDivElement>) {
    const index = geometry.pointIndexFromClientX(
      event.clientX,
      event.currentTarget.getBoundingClientRect()
    );
    if (index != null) {
      setActiveIndex(index);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ChartLegendControls
        series={model.series}
        visibleSeries={visibleSeries}
        currentHref={currentHref}
      />
      <p id={descriptionId} className="sr-only">
        {model.description}
      </p>
      <p id={instructionsId} className="sr-only">
        Используйте стрелки влево и вправо для выбора точки, Enter для
        перехода к проверкам и Escape для сброса выбора.
      </p>
      <div
        ref={plotRef}
        role="group"
        aria-label={model.title}
        aria-describedby={describedBy}
        aria-roledescription="интерактивный график"
        aria-keyshortcuts="ArrowLeft ArrowRight Enter Escape"
        tabIndex={0}
        data-accessibility-layer="app-owned"
        data-active-point-id={activePoint?.id}
        data-slot="quality-trend-plot"
        className="relative rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        onPointerMove={handlePointer}
        onPointerDown={(event) => {
          if (event.pointerType === "touch") {
            handlePointer(event);
          }
        }}
        onPointerLeave={(event) => {
          // A touch contact always ends with a pointerleave, and the tap's
          // compat-mouse focus is not guaranteed to have landed inside the
          // plot first, so touch leaves never clear inspection: the
          // selection persists until Escape or the next tap.
          if (event.pointerType === "touch") {
            return;
          }
          // Keep the selection while focus rests anywhere inside the plot:
          // a touch tap focuses the inner tabIndex=-1 svg, and Chromium ends
          // the contact with a pointerleave that must not clear inspection.
          if (!plotRef.current?.contains(document.activeElement)) {
            setActiveIndex(null);
          }
        }}
      >
        {activePoint ? (
          <ChartTooltipStatus
            id={tooltipId}
            label={activePoint.label}
            detail={activePoint.detail}
            lines={[
              {
                label: "Средний балл",
                value: formatQualityScore(score, "Нет данных")
              },
              {
                label: "К прошлому периоду",
                value:
                  delta == null
                    ? "Нет базы сравнения"
                    : `${formatQualityScoreDelta(delta)} к прошлому периоду`
              },
              {
                label: "Выборка",
                value: reviewCountLabel(activePoint.sampleSize)
              }
            ]}
            className="absolute left-3 top-3 max-w-64"
          />
        ) : null}
        {activePoint && activePosition ? (
          <span
            aria-hidden="true"
            data-slot="quality-selected-marker"
            data-point-id={activePoint.id}
            data-marker-series={activeMark?.series}
            className="pointer-events-none absolute z-10 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary ring-3 ring-primary/45 shadow-sm"
            style={{
              left: `${activePosition.left}%`,
              top: `${activePosition.top}%`
            }}
          />
        ) : null}
        <DeferredChartVisual
          load={loadQualityTrendVisual}
          componentProps={{ model, visibleSeries }}
          loadingLabel="Загрузка визуального представления"
          fallbackClassName="h-[216px] w-full min-[390px]:h-[232px] md:h-[280px] xl:h-[320px]"
          armed={activeIndex != null}
        />
      </div>
    </div>
  );
}
