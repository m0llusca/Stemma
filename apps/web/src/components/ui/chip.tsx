import type { ReactNode } from "react";
import clsx from "clsx";

/**
 * Canonical, token-driven chip primitive.
 *
 * This is the single source of truth for the chip / badge / metric look. The
 * legacy `StatusChip`, `StatusBadge` and `MetricValue` components are thin
 * wrappers around it (keeping their public APIs), and the `.meta-chip` CSS
 * family is aligned to the same `.chip` tokens. All styling lives in
 * `src/app/styles/components/05-chip.css` and is driven entirely by design
 * tokens (no raw hex), so it holds across every theme including Night Ops.
 */
export type ChipTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "accent"
  | "ai"
  | "info";

export type ChipSize = "xs" | "sm";

/** Layout shape. `pill` = inline horizontal chip; `stacked` = label over value. */
export type ChipVariant = "pill" | "stacked";

const toneClassNames: Record<ChipTone, string> = {
  neutral: "chip--neutral",
  success: "chip--success",
  warning: "chip--warning",
  danger: "chip--danger",
  accent: "chip--accent",
  ai: "chip--ai",
  info: "chip--info"
};

const sizeClassNames: Record<ChipSize, string> = {
  xs: "chip--xs",
  sm: "chip--sm"
};

export function Chip({
  children,
  tone = "neutral",
  size = "sm",
  variant = "pill",
  icon,
  label,
  value,
  numeric = false,
  title,
  className,
  /**
   * Base class for the root element. Wrappers pass their legacy class (e.g.
   * `status-badge`, `metric-value`) so existing call-site CSS keeps working;
   * the `chip` token classes are always applied alongside it.
   */
  baseClassName = "chip",
  /** Element class prefix for label/value sub-spans (defaults to `chip`). */
  partPrefix = "chip"
}: {
  children?: ReactNode;
  tone?: ChipTone;
  size?: ChipSize;
  variant?: ChipVariant;
  icon?: ReactNode;
  label?: ReactNode;
  value?: ReactNode;
  numeric?: boolean;
  title?: string;
  className?: string;
  baseClassName?: string;
  partPrefix?: string;
}) {
  const hasLabelValue = label != null || value != null;

  return (
    <span
      title={title}
      className={clsx(
        baseClassName,
        baseClassName !== "chip" && "chip",
        toneClassNames[tone],
        sizeClassNames[size],
        variant === "stacked" && "chip--stacked",
        numeric && "chip--numeric",
        className
      )}
    >
      {icon != null ? (
        <span className={`${partPrefix}__icon`} aria-hidden>
          {icon}
        </span>
      ) : null}
      {hasLabelValue ? (
        <>
          {label != null ? (
            <span className={`${partPrefix}__label`}>{label}</span>
          ) : null}
          {value != null ? (
            <span className={`${partPrefix}__value`}>{value}</span>
          ) : null}
        </>
      ) : (
        <span className="chip__body">{children}</span>
      )}
    </span>
  );
}
