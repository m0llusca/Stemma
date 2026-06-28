import Link from "next/link";
import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
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

function AgentRow({ row, rank }: { row: BreakdownRow; rank: number }) {
  const percent = scoreToPercent(row.averageScore);
  const content: ReactNode = (
    <>
      <span className="agent-leaderboard__rank tabular-nums">{rank}</span>
      <strong>{row.label}</strong>
      <em className="tabular-nums">{formatAverageScore(row.averageScore)}</em>
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
    <section className="panel overflow-clip breakdown-panel agent-leaderboard">
      <div className="breakdown-panel__header">
        <h2 className="breakdown-panel__title">{title}</h2>
        <p className="breakdown-panel__meta">
          {topRows.length > 0 ? "Средняя оценка по агентам за период" : "Нет данных за период"}
        </p>
      </div>
      <div className="agent-leaderboard__list px-5">
        {topRows.length > 0 ? (
          topRows.map((row, index) => <AgentRow key={row.label} row={row} rank={index + 1} />)
        ) : (
          <EmptyState icon={<Inbox size={22} aria-hidden="true" />} title="Нет данных за период" size="inline" />
        )}
      </div>
    </section>
  );
}
