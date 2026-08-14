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
import { DeferredChartVisual } from "@/components/charts/deferred-chart-visual.client";
import { ChartTooltipStatus } from "@/components/charts/chart-tooltip-status";
import type { ChartModel } from "@/lib/charts/contracts";
import {
  buildRankedDriverGeometry,
  viewBoxPercent
} from "@/lib/charts/plot-geometry";
import { openReportChartPointHref } from "@/lib/reports/report-evidence-links";
import { qualityScorePointWord } from "@/lib/score-display";

export type DriverSeries = "down" | "up";

const loadRankedDriverVisual = async () => {
  const module = await import("@/components/charts/recharts-visuals.client");
  return { default: module.RankedDriverVisual };
};

function signedDeltaLabel(point: ChartModel<DriverSeries>["points"][number]) {
  const down = point.values.down;
  const up = point.values.up;
  const value = up ?? (down == null ? null : -down);

  if (value == null) {
    return "Нет данных";
  }

  const rounded = Math.round(value);
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${Math.abs(rounded)} ${qualityScorePointWord(Math.abs(rounded))}`;
}

function reviewCountLabel(count: number | undefined) {
  if (count == null) {
    return "Нет данных";
  }

  return `${count} ${
    count % 10 === 1 && count % 100 !== 11
      ? "проверка"
      : count % 10 >= 2 &&
          count % 10 <= 4 &&
          !(count % 100 >= 12 && count % 100 <= 14)
        ? "проверки"
        : "проверок"
  }`;
}

export function RankedDriverChart({
  model
}: {
  model: ChartModel<DriverSeries>;
}) {
  const router = useRouter();
  const descriptionId = useId();
  const instructionsId = useId();
  const tooltipId = useId();
  const plotRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const activePoint =
    activeIndex == null ? undefined : model.points[activeIndex];
  const describedBy = activePoint
    ? `${descriptionId} ${instructionsId} ${tooltipId}`
    : `${descriptionId} ${instructionsId}`;
  const height = Math.min(420, Math.max(220, model.points.length * 36));
  const geometry = useMemo(
    () => buildRankedDriverGeometry(model, height),
    [height, model]
  );
  const activeMark =
    activeIndex == null ? null : geometry.selectedMark(activeIndex);
  const activePosition = activeMark
    ? viewBoxPercent(activeMark, geometry.width, geometry.height)
    : null;

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
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      moveActive(1);
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
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

  function handlePointer(event: PointerEvent<HTMLDivElement>) {
    if (model.points.length === 0) {
      return;
    }

    const index = geometry.pointIndexFromClientY(
      event.clientY,
      event.currentTarget.getBoundingClientRect()
    );
    if (index != null) {
      setActiveIndex(index);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div
        aria-hidden="true"
        className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground"
      >
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-destructive" />
          Просадка
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-success" />
          Улучшение
        </span>
      </div>
      <p id={descriptionId} className="sr-only">
        {model.description}
      </p>
      <p id={instructionsId} className="sr-only">
        Используйте стрелки для выбора фактора, Enter для перехода к проверкам
        и Escape для сброса выбора.
      </p>
      <div
        ref={plotRef}
        role="group"
        aria-label={model.title}
        aria-describedby={describedBy}
        aria-roledescription="интерактивный график"
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Enter Escape"
        tabIndex={0}
        data-accessibility-layer="app-owned"
        data-active-point-id={activePoint?.id}
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
              { label: "Изменение", value: signedDeltaLabel(activePoint) },
              {
                label: "Выборка",
                value: reviewCountLabel(activePoint.sampleSize)
              }
            ]}
            className="absolute right-3 top-3 max-w-64"
          />
        ) : null}
        {activePoint && activePosition ? (
          <span
            aria-hidden="true"
            data-slot="ranked-selected-marker"
            data-point-id={activePoint.id}
            data-marker-direction={activeMark?.direction}
            className="pointer-events-none absolute z-10 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground ring-3 ring-ring/55 shadow-sm"
            style={{
              left: `${activePosition.left}%`,
              top: `${activePosition.top}%`
            }}
          />
        ) : null}
        <DeferredChartVisual
          load={loadRankedDriverVisual}
          componentProps={{ model, height }}
          loadingLabel="Загрузка визуального представления"
          fallbackClassName="min-h-[220px] w-full"
          fallbackStyle={{ height }}
          armed={activeIndex != null}
        />
      </div>
    </div>
  );
}
