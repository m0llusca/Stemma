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
import { ChartTooltipStatus } from "@/components/charts/chart-tooltip-status";
import { DeferredChartVisual } from "@/components/charts/deferred-chart-visual.client";
import type { ChartModel } from "@/lib/charts/contracts";
import {
  buildScoreDistributionGeometry,
  viewBoxPercent
} from "@/lib/charts/plot-geometry";
import { openReportChartPointHref } from "@/lib/reports/report-evidence-links";

const loadScoreDistributionVisual = async () => {
  const module = await import("@/components/charts/recharts-visuals.client");
  return { default: module.ScoreDistributionVisual };
};

export function ScoreDistributionChart({
  model
}: {
  model: ChartModel<"count">;
}) {
  const router = useRouter();
  const descriptionId = useId();
  const instructionsId = useId();
  const tooltipId = useId();
  const plotRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const geometry = useMemo(
    () => buildScoreDistributionGeometry(model),
    [model]
  );
  const activePoint =
    activeIndex == null ? undefined : model.points[activeIndex];
  const activeMark =
    activeIndex == null ? null : geometry.selectedMark(activeIndex);
  const activePosition = activeMark
    ? viewBoxPercent(activeMark, geometry.width, geometry.height)
    : null;
  const describedBy = activePoint
    ? `${descriptionId} ${instructionsId} ${tooltipId}`
    : `${descriptionId} ${instructionsId}`;

  function moveActive(delta: number) {
    if (model.points.length === 0) {
      return;
    }
    setActiveIndex((current) =>
      Math.max(
        0,
        Math.min(model.points.length - 1, (current ?? 0) + delta)
      )
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setActiveIndex(null);
    } else if (event.key === "Enter" && activePoint?.href) {
      event.preventDefault();
      openReportChartPointHref(router.push, activePoint.href);
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
    <div className="flex min-w-0 flex-col gap-2">
      <p id={descriptionId} className="sr-only">
        {model.description}
      </p>
      <p id={instructionsId} className="sr-only">
        Используйте стрелки влево и вправо для выбора диапазона, Enter для
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
        data-slot="score-distribution-chart"
        className="relative rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        onFocus={() => {
          if (activeIndex == null && model.points.length > 0) {
            setActiveIndex(0);
          }
        }}
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
                label: "Проверки",
                value: String(activePoint.values.count ?? 0)
              }
            ]}
            className="absolute left-3 top-3 max-w-64"
          />
        ) : null}
        {activePoint && activePosition ? (
          <span
            aria-hidden="true"
            data-slot="score-distribution-selected-marker"
            data-point-id={activePoint.id}
            className="pointer-events-none absolute z-10 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary ring-3 ring-primary/45 shadow-sm"
            style={{
              left: `${activePosition.left}%`,
              top: `${activePosition.top}%`
            }}
          />
        ) : null}
        <DeferredChartVisual
          load={loadScoreDistributionVisual}
          componentProps={{ model }}
          loadingLabel="Загрузка визуального представления"
          fallbackClassName="h-[200px] w-full min-[390px]:h-[216px] md:h-[240px] xl:h-[260px]"
          armed={activeIndex != null}
        />
      </div>
    </div>
  );
}
