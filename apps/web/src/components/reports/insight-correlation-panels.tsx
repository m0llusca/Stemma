import Link from "next/link";
import { Inbox, MessageSquareWarning } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ownerTypeLabels } from "@/lib/labels";
import { formatAverageScore } from "@/lib/reports/report-format";
import { formatQualityScoreDelta } from "@/lib/score-display";
import type { ReasonTrendRow, SentimentCorrelation } from "@/lib/reports/report-aggregation";

export type ReasonTrendItem = ReasonTrendRow & {
  // Drill-through to the filtered reviews queue for this reason category.
  href: string;
};

// "Причины и темы": ranks recurring finding categories (reasons/themes) by
// current-period volume, showing the period-over-period count delta, the
// high-risk share and the team that owns the theme, each linking to the
// filtered reviews queue. Mirrors the BreakdownTable record-card layout.
export function ReasonTrendPanel({
  rows,
  actionLabel = "Открыть проверки"
}: {
  rows: ReasonTrendItem[];
  actionLabel?: string;
}) {
  return (
    <section className="panel overflow-clip breakdown-panel reason-trend-panel" aria-labelledby="reason-trend-title">
      <div className="breakdown-panel__header">
        <h2 id="reason-trend-title" className="breakdown-panel__title">Причины и темы</h2>
        <p className="breakdown-panel__meta">
          {rows.length > 0
            ? "Повторяющиеся причины замечаний и их динамика к прошлому периоду"
            : "Нет замечаний за выбранный период"}
        </p>
      </div>
      <div className="record-list px-5">
        {rows.length > 0 ? (
          rows.map((row) => (
            <article key={row.category} className="record-card">
              <div className="record-row">
                <h3 className="record-title">{row.category}</h3>
                <Chip tone="neutral" size="sm" numeric value={row.count} label="замечаний" />
              </div>
              <p className="record-meta record-meta--inline">
                <span className="record-meta__label">К прошлому периоду</span>
                {row.delta !== 0 ? (
                  <Chip tone={row.delta > 0 ? "danger" : "success"} size="xs" numeric>
                    {`${row.delta > 0 ? "+" : ""}${row.delta}`}
                  </Chip>
                ) : (
                  <span className="record-meta__value tabular-nums">без изменений</span>
                )}
                {row.highRiskCount > 0 ? (
                  <Chip tone="warning" size="xs">{`HIGH+ ${row.highRiskCount}`}</Chip>
                ) : null}
              </p>
              <p className="record-meta compact-text">
                Чаще всего отвечает: {ownerTypeLabels[row.topOwnerType]}. Было {row.previousCount}.
              </p>
              <Link href={row.href} className="record-card__action">
                {actionLabel}
              </Link>
            </article>
          ))
        ) : (
          <EmptyState
            icon={<Inbox size={22} aria-hidden="true" />}
            title="Нет замечаний"
            description="Причины и темы появятся после первых завершённых проверок с замечаниями."
            size="inline"
          />
        )}
      </div>
    </section>
  );
}

// "Тональность и качество": correlates conversation sentiment against the QA
// average score, mirroring the CSAT correlation. Handles the not-yet-scored
// case: when no conversation in the period has a sentiment, the panel renders a
// clean empty state; a partial coverage note appears whenever some reviews are
// still unscored.
export function SentimentCorrelationPanel({
  correlation,
  actionHref,
  actionLabel = "Открыть проверки"
}: {
  correlation: SentimentCorrelation;
  actionHref?: string;
  actionLabel?: string;
}) {
  const { rows, scoredCount, unscoredCount, totalCount } = correlation;
  const coveragePercent = totalCount > 0 ? Math.round((scoredCount / totalCount) * 100) : 0;
  const maxCount = Math.max(...rows.map((row) => row.count), 1);

  return (
    <section className="panel chart-panel overflow-clip sentiment-correlation-panel" aria-labelledby="sentiment-correlation-title">
      <div className="chart-panel__header">
        <div className="min-w-0">
          <h2 id="sentiment-correlation-title" className="chart-panel__title">Тональность и качество</h2>
          <p className="chart-panel__desc">
            Средний балл проверки в разрезе тональности диалога.
          </p>
        </div>
        {actionHref ? (
          <Link href={actionHref} className="chart-panel__action">
            {actionLabel}
          </Link>
        ) : null}
      </div>
      <div className="chart-panel__body">
        {scoredCount === 0 ? (
          <EmptyState
            icon={<MessageSquareWarning size={22} aria-hidden="true" />}
            title="Тональность ещё не определена"
            description={
              totalCount > 0
                ? "Диалоги периода пока не размечены по тональности. Корреляция появится после авто-скоринга."
                : "Корреляция появится после первых завершённых проверок."
            }
            size="inline"
          />
        ) : (
          <>
            <div className="sentiment-correlation">
              {rows.map((row) => {
                const widthPercent = Math.round((row.count / maxCount) * 100);

                return (
                  <div key={row.key} className={`sentiment-correlation__row sentiment-correlation__row--${row.key}`}>
                    <div className="sentiment-correlation__head">
                      <span className="sentiment-correlation__label">{row.label}</span>
                      <span className="sentiment-correlation__score tabular-nums">
                        {formatAverageScore(row.averageScore)}
                      </span>
                    </div>
                    <div className="sentiment-correlation__track">
                      <div
                        className="sentiment-correlation__fill"
                        style={{ width: `${row.count > 0 ? Math.max(6, widthPercent) : 0}%` }}
                      />
                    </div>
                    <p className="sentiment-correlation__meta tabular-nums">
                      {row.count > 0 ? `${row.count} проверок` : "нет проверок"}
                    </p>
                  </div>
                );
              })}
            </div>
            {unscoredCount > 0 ? (
              <p className="sentiment-correlation__coverage">
                Размечено {coveragePercent}% выборки. Ещё {unscoredCount} без тональности.
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
