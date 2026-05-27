import { qualityScoreDelta } from "@/lib/score-display";

export type ImprovementSourceRow = {
  label: string;
  count: number;
  averageScore?: number | null;
  href?: string;
};

export type ImprovementSource = {
  label: string;
  rows: ImprovementSourceRow[];
  previousRows: ImprovementSourceRow[];
};

export type ImprovementHighlight = {
  scope: string;
  label: string;
  count: number;
  currentScore: number;
  previousScore: number;
  delta: number;
  href?: string;
};

export function buildImprovementHighlights(sources: ImprovementSource[], limit = 4): ImprovementHighlight[] {
  const highlights: ImprovementHighlight[] = [];

  for (const source of sources) {
    const previousByLabel = new Map(source.previousRows.map((row) => [row.label, row.averageScore ?? null]));

    for (const row of source.rows) {
      const previousScore = previousByLabel.get(row.label);
      const delta = qualityScoreDelta(row.averageScore, previousScore);

      if (row.averageScore == null || previousScore == null || delta == null || delta <= 0) {
        continue;
      }

      highlights.push({
        scope: source.label,
        label: row.label,
        count: row.count,
        currentScore: row.averageScore,
        previousScore,
        delta,
        href: row.href
      });
    }
  }

  return highlights
    .sort((left, right) => right.delta - left.delta || right.count - left.count || left.label.localeCompare(right.label, "ru"))
    .slice(0, limit);
}
