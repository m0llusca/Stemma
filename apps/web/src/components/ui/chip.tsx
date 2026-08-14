import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Canonical chip primitive — public API preserved, surface is shadcn Badge.
 * Keeps legacy `chip` / `chip--{tone}` class hooks for tests and residual CSS.
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

const toneClass: Record<ChipTone, string> = {
  neutral: "",
  success: "border-transparent bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  warning: "border-transparent bg-amber-500/15 text-amber-900 dark:text-amber-300",
  danger: "border-transparent bg-destructive/15 text-destructive",
  accent: "border-transparent bg-primary/10 text-primary",
  ai: "border-transparent bg-violet-500/15 text-violet-800 dark:text-violet-300",
  info: "border-transparent bg-primary/15 text-primary"
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
  baseClassName = "chip",
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
  const legacyTone = `chip--${tone}`;
  const legacySize = size === "xs" ? "chip--xs" : "chip--sm";

  if (variant === "stacked") {
    return (
      <span
        title={title}
        className={cn(
          baseClassName,
          "chip",
          legacyTone,
          legacySize,
          "inline-flex flex-col gap-0.5 rounded-md border border-border bg-muted/40 px-2 py-1",
          toneClass[tone],
          className
        )}
      >
        {label != null ? (
          <span className={cn(`${partPrefix}__label`, "text-[10px] uppercase tracking-wide text-muted-foreground")}>
            {label}
          </span>
        ) : null}
        {label != null ? " " : null}
        <span className={cn(`${partPrefix}__value`, "text-sm font-medium tabular-nums text-foreground")}>
          {icon}
          {value ?? children}
        </span>
      </span>
    );
  }

  if (hasLabelValue) {
    return (
      <Badge
        title={title}
        variant={tone === "neutral" ? "secondary" : "outline"}
        className={cn(
          baseClassName,
          "chip",
          legacyTone,
          legacySize,
          "font-normal",
          size === "xs" ? "h-5 gap-1 px-1.5 text-[11px]" : "h-6 gap-1.5 px-2 text-xs",
          numeric && "tabular-nums",
          toneClass[tone],
          className
        )}
      >
        {icon != null ? <span className={`${partPrefix}__icon`}>{icon}</span> : null}
        {label != null ? (
          <span className={`${partPrefix}__label text-muted-foreground`}>{label}</span>
        ) : null}
        {label != null && value != null ? " " : null}
        {value != null ? (
          <span className={cn(`${partPrefix}__value`, numeric && "tabular-nums")}>{value}</span>
        ) : (
          children
        )}
      </Badge>
    );
  }

  return (
    <Badge
      title={title}
      variant={tone === "neutral" ? "secondary" : "outline"}
      className={cn(
        baseClassName,
        "chip",
        legacyTone,
        legacySize,
        "font-normal",
        size === "xs" ? "h-5 px-1.5 text-[11px]" : "h-6 px-2 text-xs",
        numeric && "tabular-nums",
        toneClass[tone],
        className
      )}
    >
      {icon != null ? <span className={`${partPrefix}__icon mr-1`}>{icon}</span> : null}
      {children}
    </Badge>
  );
}
