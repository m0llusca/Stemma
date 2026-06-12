import Link from "next/link";
import type { ReactNode } from "react";
import type { BreakdownRow } from "@/lib/reports/report-aggregation";
import { formatAverageScore } from "@/lib/reports/report-format";
import { clampQualityScore } from "@/lib/score-display";

// Quality scores are on a 0-100 scale (see clampQualityScore in score-display.ts),
// so the bar fill maps the average score directly as a percentage of 100.
function scoreToPercent(averageScore: number | null | undefined) {
  if (averageScore == null || !Number.isFinite(averageScore)) {
    return 0;
  }

  // Keep a small minimum so a non-zero score is always visible as a sliver.
  return Math.max(4, clampQualityScore(averageScore));
}

function agentInitials(name: string) {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "QA";
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toLocaleUpperCase("ru-RU");
  }

  return (words[0][0] + words[1][0]).toLocaleUpperCase("ru-RU");
}

function AgentRow({ row }: { row: BreakdownRow }) {
  const percent = scoreToPercent(row.averageScore);
  const content: ReactNode = (
    <>
      <span>{agentInitials(row.label)}</span>
      <strong>{row.label}</strong>
      <em>{formatAverageScore(row.averageScore)}</em>
      <i style={{ width: `${percent}%` }} />
    </>
  );

  if (row.href) {
    return (
      <Link href={row.href} className="agent-leaderboard__row">
        {content}
      </Link>
    );
  }

  return <div className="agent-leaderboard__row">{content}</div>;
}

export function ReportAgentLeaderboard({
  title,
  rows,
  max = 6
}: {
  title: string;
  rows: BreakdownRow[];
  max?: number;
}) {
  const topRows = [...rows]
    .sort((left, right) => (right.averageScore ?? 0) - (left.averageScore ?? 0))
    .slice(0, max);

  return (
    <section className="panel overflow-hidden breakdown-panel agent-leaderboard">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {topRows.length > 0 ? "Лидеры по средней оценке за период" : "Нет данных за период"}
        </p>
      </div>
      <div className="agent-leaderboard__list px-5">
        {topRows.length > 0 ? (
          topRows.map((row) => <AgentRow key={row.label} row={row} />)
        ) : (
          <div className="soft-callout text-sm text-[var(--text-muted)]">Нет данных за период</div>
        )}
      </div>
    </section>
  );
}
