function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreTone(score: number) {
  if (score < 60) {
    return "bg-[#d92d20]";
  }

  if (score < 85) {
    return "bg-[#f79009]";
  }

  return "bg-[#116466]";
}

export function ScoreBar({
  value,
  emptyLabel = "Нет оценки",
  compact = false
}: {
  value?: number | null;
  emptyLabel?: string;
  compact?: boolean;
}) {
  if (value == null) {
    return <span className="whitespace-nowrap text-sm font-medium text-[#667085]">{emptyLabel}</span>;
  }

  const score = clampScore(value);

  return (
    <div className={`grid min-w-[88px] gap-1 ${compact ? "max-w-[120px]" : "max-w-[180px]"}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-[#17202a]">{score}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#e4e8ef]">
        <div className={`h-full rounded-full ${scoreTone(score)}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}
