"use client";

import clsx from "clsx";
import { CircleHelp } from "lucide-react";
import type { FocusEvent, KeyboardEvent, ReactNode } from "react";
import { useId, useRef, useState } from "react";

type HelpTooltipPlacement = "top" | "top-start" | "top-end";

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
  const [open, setOpen] = useState(false);

  function closeWhenFocusLeaves(event: FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget;

    if (nextTarget instanceof Node && wrapperRef.current?.contains(nextTarget)) {
      return;
    }

    setOpen(false);
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "Escape") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
  }

  return (
    <div
      ref={wrapperRef}
      className={clsx("help-tooltip", className)}
      data-open={open ? "true" : "false"}
      data-placement={placement}
      onBlur={closeWhenFocusLeaves}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="help-tooltip__trigger"
        aria-label={label}
        aria-describedby={id}
        onFocus={() => setOpen(true)}
        onKeyDown={handleTriggerKeyDown}
      >
        <CircleHelp aria-hidden="true" size={14} />
      </button>
      <div id={id} role="tooltip" className="help-tooltip__content">
        {content}
      </div>
    </div>
  );
}
