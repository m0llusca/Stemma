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
    <div className={`grid min-w-[104px] gap-1 ${compact ? "max-w-[154px]" : "max-w-[190px]"}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-[#111827]">{label ? `${label}: ` : ""}{formatQualityScore(score)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#e2e8f0]" aria-hidden="true">
        <div className={`h-full rounded-full ${scoreTone(score)}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}
