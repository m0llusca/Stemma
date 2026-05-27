"use client";

import clsx from "clsx";
import { CircleHelp } from "lucide-react";
import { createPortal } from "react-dom";
import type { CSSProperties, FocusEvent, ReactNode } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

type HelpTooltipPlacement = "top" | "top-start" | "top-end";
type HelpTooltipPosition = {
  left: number;
  top: number;
  width: number;
  side: "top" | "bottom";
};

const POINTER_CLOSE_DELAY_MS = 120;
const TOOLTIP_GAP_PX = 8;
const VIEWPORT_MARGIN_PX = 16;
const TOOLTIP_MAX_WIDTH_PX = 280;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function HelpTooltip({
  label,
  content,
  className,
  placement = "top"
}: {
  label: string;
  content: ReactNode;
  className?: string;
  placement?: HelpTooltipPlacement;
}) {
  const id = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const pointerCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<HelpTooltipPosition | null>(null);

  const clearPointerCloseTimer = useCallback(() => {
    if (pointerCloseTimerRef.current === null) {
      return;
    }

    clearTimeout(pointerCloseTimerRef.current);
    pointerCloseTimerRef.current = null;
  }, []);

  const updateTooltipPosition = useCallback(() => {
    const anchor = wrapperRef.current;
    const tooltip = tooltipRef.current;

    if (!anchor || !tooltip || typeof window === "undefined") {
      return;
    }

    const anchorRect = anchor.getBoundingClientRect();
    const maxWidth = Math.max(160, window.innerWidth - VIEWPORT_MARGIN_PX * 2);
    const width = Math.min(TOOLTIP_MAX_WIDTH_PX, maxWidth);

    tooltip.style.width = `${width}px`;
    const tooltipRect = tooltip.getBoundingClientRect();
    const tooltipWidth = Math.min(tooltipRect.width || width, maxWidth);
    const tooltipHeight = tooltipRect.height || 0;

    const preferredLeft =
      placement === "top-start"
        ? anchorRect.left
        : placement === "top-end"
          ? anchorRect.right - tooltipWidth
          : anchorRect.left + anchorRect.width / 2 - tooltipWidth / 2;

    const maxLeft = Math.max(VIEWPORT_MARGIN_PX, window.innerWidth - tooltipWidth - VIEWPORT_MARGIN_PX);
    const left = clamp(preferredLeft, VIEWPORT_MARGIN_PX, maxLeft);
    const topCandidate = anchorRect.top - tooltipHeight - TOOLTIP_GAP_PX;
    const canFitTop = topCandidate >= VIEWPORT_MARGIN_PX;
    const bottomCandidate = anchorRect.bottom + TOOLTIP_GAP_PX;
    const maxTop = Math.max(VIEWPORT_MARGIN_PX, window.innerHeight - tooltipHeight - VIEWPORT_MARGIN_PX);
    const top = canFitTop ? topCandidate : clamp(bottomCandidate, VIEWPORT_MARGIN_PX, maxTop);

    setTooltipPosition({
      left,
      top,
      width: tooltipWidth,
      side: canFitTop ? "top" : "bottom"
    });
  }, [placement]);

  const openTooltip = useCallback(() => {
    clearPointerCloseTimer();
    setOpen(true);
  }, [clearPointerCloseTimer]);

  const closeTooltip = useCallback(() => {
    clearPointerCloseTimer();
    setOpen(false);
  }, [clearPointerCloseTimer]);

  const schedulePointerClose = useCallback(() => {
    clearPointerCloseTimer();
    pointerCloseTimerRef.current = setTimeout(() => {
      pointerCloseTimerRef.current = null;
      setOpen(false);
    }, POINTER_CLOSE_DELAY_MS);
  }, [clearPointerCloseTimer]);

  useEffect(() => {
    setPortalRoot(document.body);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        closeTooltip();
      }
    }

    document.addEventListener("keydown", closeOnEscape, true);

    return () => {
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [closeTooltip, open]);

  useEffect(() => {
    if (!open) {
      setTooltipPosition(null);
      return;
    }

    updateTooltipPosition();
    const animationFrame = window.requestAnimationFrame(updateTooltipPosition);

    window.addEventListener("resize", updateTooltipPosition);
    window.addEventListener("scroll", updateTooltipPosition, true);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", updateTooltipPosition);
      window.removeEventListener("scroll", updateTooltipPosition, true);
    };
  }, [open, updateTooltipPosition]);

  useEffect(() => clearPointerCloseTimer, [clearPointerCloseTimer]);

  function closeWhenFocusLeaves(event: FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget;

    if (
      nextTarget instanceof Node &&
      (wrapperRef.current?.contains(nextTarget) || tooltipRef.current?.contains(nextTarget))
    ) {
      return;
    }

    closeTooltip();
  }

  const tooltipStyle =
    tooltipPosition === null
      ? undefined
      : ({
          left: `${tooltipPosition.left}px`,
          top: `${tooltipPosition.top}px`,
          width: `${tooltipPosition.width}px`
        } satisfies CSSProperties);

  return (
    <div
      ref={wrapperRef}
      className={clsx("help-tooltip", className)}
      data-open={open ? "true" : "false"}
      data-placement={placement}
      onBlur={closeWhenFocusLeaves}
      onPointerEnter={openTooltip}
      onPointerLeave={schedulePointerClose}
    >
      <button
        type="button"
        className="help-tooltip__trigger"
        aria-label={label}
        aria-describedby={id}
        onFocus={openTooltip}
      >
        <CircleHelp aria-hidden="true" size={14} />
      </button>
      {portalRoot
        ? createPortal(
            <div
              ref={tooltipRef}
              id={id}
              role="tooltip"
              className="help-tooltip__content"
              data-open={open ? "true" : "false"}
              data-placement={placement}
              data-positioned={tooltipPosition === null ? "false" : "true"}
              data-side={tooltipPosition?.side ?? "top"}
              style={tooltipStyle}
              onPointerEnter={openTooltip}
              onPointerLeave={schedulePointerClose}
            >
              {content}
            </div>,
            portalRoot
          )
        : null}
    </div>
  );
}
