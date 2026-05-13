import clsx from "clsx";
import { CircleHelp } from "lucide-react";
import type { ReactNode } from "react";
import { useId } from "react";

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

  return (
    <div className={clsx("help-tooltip", className)} data-placement={placement}>
      <button type="button" className="help-tooltip__trigger" aria-label={label} aria-describedby={id}>
        <CircleHelp aria-hidden="true" size={14} />
      </button>
      <div id={id} role="tooltip" className="help-tooltip__content">
        {content}
      </div>
    </div>
  );
}
