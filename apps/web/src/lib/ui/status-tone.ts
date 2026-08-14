export type StatusTone = "positive" | "warning" | "negative" | "neutral" | "info";

const statusToneClasses: Record<StatusTone, string> = {
  positive: "text-success",
  warning: "text-warning",
  negative: "text-destructive",
  neutral: "text-muted-foreground",
  info: "text-primary"
};

export function toneForScore(score?: number | null): StatusTone {
  if (score == null || !Number.isFinite(score)) {
    return "neutral";
  }

  if (score >= 90) {
    return "positive";
  }

  if (score >= 70) {
    return "warning";
  }

  return "negative";
}

export function toneForCount(
  count: number,
  {
    zero,
    nonZero
  }: {
    zero: StatusTone;
    nonZero: StatusTone;
  }
): StatusTone {
  return count === 0 ? zero : nonZero;
}

export function statusToneClass(tone: StatusTone): string {
  return statusToneClasses[tone];
}

const statusSurfaceClasses: Record<StatusTone, string> = {
  positive: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  negative: "bg-destructive/15 text-destructive",
  neutral: "bg-muted text-muted-foreground",
  info: "bg-primary/10 text-primary"
};

/**
 * Soft tinted surface + matching foreground for status chips/badges.
 * Use instead of hard-coded `bg-emerald-500/15 text-emerald-800 …` strings so
 * every theme token (--success-soft / --warning-soft / --destructive) stays authoritative.
 */
export function statusSurfaceClass(tone: StatusTone): string {
  return statusSurfaceClasses[tone];
}
