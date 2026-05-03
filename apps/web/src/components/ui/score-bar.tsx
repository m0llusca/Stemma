function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

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
  if (value == null) {
    return <span className="whitespace-nowrap text-sm font-medium text-[#64748b]">{emptyLabel}</span>;
  }

  const score = clampScore(value);

  return (
    <div className={`grid min-w-[88px] gap-1 ${compact ? "max-w-[140px]" : "max-w-[180px]"}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-[#111827]">{label ? `${label}: ` : ""}{score}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#e2e8f0]">
        <div className={`h-full rounded-full ${scoreTone(score)}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}
