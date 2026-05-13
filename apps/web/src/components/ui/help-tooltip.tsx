"use client";

import clsx from "clsx";
import { CircleHelp } from "lucide-react";
import type { FocusEvent, ReactNode } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

type HelpTooltipPlacement = "top" | "top-start" | "top-end";
const POINTER_CLOSE_DELAY_MS = 120;

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
  const pointerCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);

  const clearPointerCloseTimer = useCallback(() => {
    if (pointerCloseTimerRef.current === null) {
      return;
    }

    clearTimeout(pointerCloseTimerRef.current);
    pointerCloseTimerRef.current = null;
  }, []);

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

  useEffect(() => clearPointerCloseTimer, [clearPointerCloseTimer]);

  function closeWhenFocusLeaves(event: FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget;

    if (nextTarget instanceof Node && wrapperRef.current?.contains(nextTarget)) {
      return;
    }

    closeTooltip();
  }

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
      <div
        id={id}
        role="tooltip"
        className="help-tooltip__content"
        onPointerEnter={openTooltip}
        onPointerLeave={schedulePointerClose}
      >
        {content}
      </div>
    </div>
  );
}
