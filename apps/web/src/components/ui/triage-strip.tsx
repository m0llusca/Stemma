import type { ReactNode } from "react";
import clsx from "clsx";

/**
 * Decision-first banner that opens a queue or workbench.
 *
 * A calm, single-row strip that states what to do next: an accent icon, a bold
 * title, an optional sub line, and at most ONE action on the right. Soft accent
 * wash background (`--accent-soft`), hairline border, rounded. The `tone` prop
 * recolors the icon/accent wash for non-default states (warning/danger/success/
 * ai) while keeping the same calm shape. Token-driven (no raw hex), holds across
 * every theme including Night Ops. Russian-friendly: callers pass the copy.
 *
 * All styling lives in `src/app/styles/components/07-shell.css` under
 * `.triage-strip*`.
 */
export type TriageStripTone = "accent" | "success" | "warning" | "danger" | "ai";

const toneClassNames: Record<TriageStripTone, string> = {
  accent: "triage-strip--accent",
  success: "triage-strip--success",
  warning: "triage-strip--warning",
  danger: "triage-strip--danger",
  ai: "triage-strip--ai"
};

export function TriageStrip({
  icon,
  title,
  description,
  action,
  tone = "accent",
  className
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  tone?: TriageStripTone;
  className?: string;
}) {
  return (
    <div className={clsx("triage-strip", toneClassNames[tone], className)}>
      {icon != null ? (
        <span className="triage-strip__icon" aria-hidden>
          {icon}
        </span>
      ) : null}
      <div className="triage-strip__body">
        <p className="triage-strip__title">{title}</p>
        {description != null ? (
          <p className="triage-strip__description">{description}</p>
        ) : null}
      </div>
      {action != null ? <div className="triage-strip__action">{action}</div> : null}
    </div>
  );
}
