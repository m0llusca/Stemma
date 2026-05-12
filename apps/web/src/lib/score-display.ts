export const qualityScoreUnit = "points" as const;

export function clampQualityScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function qualityScorePointWord(value: number) {
  const absolute = Math.abs(value);
  const lastTwo = absolute % 100;
  const last = absolute % 10;

  if (lastTwo >= 11 && lastTwo <= 14) {
    return "баллов";
  }

  if (last === 1) {
    return "балл";
  }

  if (last >= 2 && last <= 4) {
    return "балла";
  }

  return "баллов";
}

export function formatQualityScore(
  value: number | null | undefined,
  emptyLabel = "Нет оценки"
) {
  if (value == null) {
    return emptyLabel;
  }

  const score = clampQualityScore(value);
  return `${score} ${qualityScorePointWord(score)}`;
}

export function formatQualityScoreDelta(value: number | null | undefined) {
  if (value == null) {
    return "0 п.";
  }

  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded} п.`;
}
