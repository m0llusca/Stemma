import Link from "next/link";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { SparklineChart, type ChartDatum } from "@/components/reports/report-charts";
import type { ReportPeriod } from "@/lib/report-period";
import { formatQualityScoreDelta, qualityScoreDelta } from "@/lib/score-display";
import {
  formatAverageScore,
  reportReviewHref,
  targetDistanceLabel,
  trendPointDeltaLabel,
  trendTone,
  type TrendTone
} from "@/lib/reports/report-format";

export function TrendSignals({ points, target = 90 }: { points: ChartDatum[]; target?: number }) {
  if (points.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">Нет завершенных проверок за выбранный период.</p>;
  }

  const pointsWithDeltas = points.map((point, index) => ({
    ...point,
    delta: index === 0 ? null : qualityScoreDelta(point.value, points[index - 1].value)
  }));
  const last = pointsWithDeltas[pointsWithDeltas.length - 1];
  const lowest = pointsWithDeltas.reduce((candidate, point) => (point.value < candidate.value ? point : candidate), pointsWithDeltas[0]);
  const strongestMove = pointsWithDeltas
    .slice(1)
    .sort((left, right) => Math.abs(right.delta ?? 0) - Math.abs(left.delta ?? 0))[0];
  const targetDelta = qualityScoreDelta(last.value, target) ?? 0;
  const targetDistance = targetDelta >= 0 ? "в норме" : `-${Math.abs(targetDelta)} баллов`;
  const rows = [
    {
      label: "Последняя точка",
      value: formatAverageScore(last.value),
      detail: [last.label, last.detail, trendPointDeltaLabel(last.delta)].filter(Boolean).join(", "),
      tone: trendTone(last.delta)
    },
    {
      label: "Минимум периода",
      value: formatAverageScore(lowest.value),
      detail: [lowest.label, lowest.detail, targetDistanceLabel(lowest.value, target)].filter(Boolean).join(", "),
      tone: "down" as TrendTone
    },
    {
      label: "Цель 90 баллов",
      value: targetDistance,
      detail: last.value >= target ? "Последняя точка держится в рабочем коридоре." : `Ниже цели на ${Math.abs(targetDelta)} баллов, нужен разбор причин просадки.`,
      tone: last.value >= target ? "up" as TrendTone : "down" as TrendTone
    }
  ];

  if (strongestMove) {
    rows.splice(2, 0, {
      label: "Самое сильное движение",
      value: formatQualityScoreDelta(strongestMove.delta),
      detail: [strongestMove.label, trendPointDeltaLabel(strongestMove.delta), formatAverageScore(strongestMove.value)].join(", "),
      tone: trendTone(strongestMove.delta)
    });
  }

  return (
    <div className="trend-signal-list">
      {rows.map((row) => (
        <article key={row.label} className={`trend-signal trend-signal--${row.tone}`}>
          <div>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
          <p>{row.detail}</p>
        </article>
      ))}
    </div>
  );
}

/**
 * Period trend for the average score. The headline number + delta already live
 * in the KPI row's lead tile, so this panel owns only the *trajectory*: a goal
 * line chart plus trend signals (last point, period low, strongest move, target
 * gap). No restated scorecard — that was the duplicate the KPI tile covers.
 */
export function PrimaryScorePanel({
  finalizedCount,
  previousCount,
  trendRows,
  period
}: {
  finalizedCount: number;
  previousCount: number;
  trendRows: ChartDatum[];
  period: ReportPeriod;
}) {
  const stable = finalizedCount >= 5 && previousCount >= 5;

  return (
    <section className="panel primary-score-panel">
      <div className="primary-score-panel__head">
        <div className="min-w-0">
          <p className="page-kicker">Тренд</p>
          <div className="flex items-center gap-2">
            <h2 className="primary-score-panel__title">Средняя оценка за период</h2>
            <HelpTooltip
              label="Как считать оценку в баллах?"
              content="Итоговая оценка хранится как нормализованное значение от 0 до 100 и показывается как баллы."
              placement="top-start"
            />
          </div>
        </div>
        <Link href={reportReviewHref(period)} className="chart-panel__action">
          Открыть проверки
        </Link>
      </div>
      <div className="primary-score-panel__chart">
        <SparklineChart
          points={trendRows}
          target={90}
          annotation={stable ? "Пунктир показывает целевой коридор 90 баллов." : "Для устойчивого тренда нужно не меньше 5 проверок в каждом периоде."}
        />
      </div>
      <div className="primary-score-panel__signals" aria-label="Сигналы тренда средней оценки">
        <TrendSignals points={trendRows} />
      </div>
    </section>
  );
}
