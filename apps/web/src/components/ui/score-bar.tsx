import { clampQualityScore, formatQualityScore } from "@/lib/score-display";

function scoreTone(score: number) {
  if (score < 60) {
    return "bg-[#dc2626]";
  }

  if (score < 85) {
    return "bg-[#d97706]";
  }

  return "bg-[#3157d5]";
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
    return <span className="whitespace-nowrap text-sm font-medium text-[#64748b]">{emptyLabel}</span>;
  }

  const score = clampQualityScore(value);

  return (
    <div className={`grid ${compact ? "min-w-[96px] max-w-[140px] gap-0.5" : "min-w-[104px] max-w-[190px] gap-1"}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={`${compact ? "text-xs" : "text-sm"} font-semibold text-[#111827]`}>{label ? `${label}: ` : ""}{formatQualityScore(score)}</span>
      </div>
      <div className={`${compact ? "h-1" : "h-1.5"} overflow-hidden rounded-full bg-[#e2e8f0]`} aria-hidden="true">
        <div className={`h-full rounded-full ${scoreTone(score)}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}
