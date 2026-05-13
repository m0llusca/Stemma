"use client";

import { CircleHelp } from "lucide-react";
import type { ReactNode } from "react";
import { useId } from "react";

export function HelpTooltip({
  label,
  content,
  className = ""
}: {
  label: string;
  content: ReactNode;
  className?: string;
}) {
  const id = useId();

  return (
    <span className={`help-tooltip ${className}`}>
      <button type="button" className="help-tooltip__trigger" aria-label={label} aria-describedby={id}>
        <CircleHelp aria-hidden="true" size={14} />
      </button>
      <span id={id} role="tooltip" className="help-tooltip__content">
        {content}
      </span>
    </span>
  );
}
