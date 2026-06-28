import { clampQualityScore, formatQualityScore } from "@/lib/score-display";

function scoreTone(score: number) {
  if (score < 60) {
    return "bg-[var(--danger)]";
  }

  if (score < 85) {
    return "bg-[var(--warning)]";
  }

  return "bg-[var(--success)]";
}

export function ScoreBar({
  value,
  emptyLabel = "Нет оценки",
  compact = false,
  label
}: {
  value?: number | null;
  emptyLabel?: string;
  compact?: boolean;
  label?: string;
}) {
  if (value == null || !Number.isFinite(value)) {
    return <span className="whitespace-nowrap text-sm font-medium text-[var(--text-muted)]">{emptyLabel}</span>;
  }

  const score = clampQualityScore(value);

  return (
    <div className={`grid ${compact ? "min-w-[96px] max-w-[140px] gap-0.5" : "min-w-[104px] max-w-[190px] gap-1"}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={`${compact ? "text-xs" : "text-sm"} font-semibold text-[var(--foreground)]`}>{label ? `${label}: ` : ""}{formatQualityScore(score)}</span>
      </div>
      <div className={`${compact ? "h-1" : "h-1.5"} overflow-clip rounded-full bg-[var(--border)]`} aria-hidden="true">
        <div className={`h-full rounded-full ${scoreTone(score)}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}
