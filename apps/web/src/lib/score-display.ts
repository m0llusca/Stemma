export const qualityScoreUnit = "points" as const;

export function clampQualityScore(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

export function qualityScorePointWord(value: number) {
  const absolute = Math.abs(clampQualityScore(value));
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
  if (value == null || !Number.isFinite(value)) {
    return emptyLabel;
  }

  const score = clampQualityScore(value);
  return `${score} ${qualityScorePointWord(score)}`;
}

export function qualityScoreDelta(current: number | null | undefined, previous: number | null | undefined) {
  if (current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous)) {
    return null;
  }

  return clampQualityScore(current) - clampQualityScore(previous);
}

export function formatQualityScoreDelta(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return "0 баллов";
  }

  const rounded = Math.sign(value) * Math.round(Math.abs(value));
  return `${rounded > 0 ? "+" : ""}${rounded} ${qualityScorePointWord(Math.abs(rounded))}`;
}
