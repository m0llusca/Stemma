export type StatusTone = "positive" | "warning" | "negative" | "neutral" | "info";

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
  return `status-tone status-tone--${tone}`;
}
