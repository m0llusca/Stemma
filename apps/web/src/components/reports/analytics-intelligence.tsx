import Link from "next/link";
import type { ReactNode } from "react";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { formatQualityScore } from "@/lib/score-display";
import styles from "./analytics-intelligence.module.css";

export type MetricInsightTone = "neutral" | "ok" | "warn" | "danger";

export type MetricInsightItem = {
  label: string;
  value: string;
  detail: string;
  progress: number | null;
  progressLabel: string;
  explanation?: ReactNode;
  explanationLabel?: string;
  href?: string;
  tone?: MetricInsightTone;
};

export type CriterionHeatmapRow = {
  label: string;
  score: number | null;
  count: number;
  detail: string;
};

type HeatmapTone = "excellent" | "stable" | "watch" | "critical" | "empty";

const metricToneClass: Record<MetricInsightTone, string> = {
  neutral: styles.metricInsightNeutral,
  ok: styles.metricInsightOk,
  warn: styles.metricInsightWarn,
  danger: styles.metricInsightDanger
};

const heatmapToneClass: Record<HeatmapTone, string> = {
  excellent: styles.heatmapCellExcellent,
  stable: styles.heatmapCellStable,
  watch: styles.heatmapCellWatch,
  critical: styles.heatmapCellCritical,
  empty: styles.heatmapCellEmpty
};

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function roundedProgress(value: number | null) {
  return value == null ? null : Math.round(clampPercent(value));
}

function formatProgress(value: number | null) {
  const progress = roundedProgress(value);

  return progress == null ? "нет данных" : `${progress}%`;
}

function heatmapTone(score: number | null): HeatmapTone {
  if (score == null) {
    return "empty";
  }

  if (score >= 90) {
    return "excellent";
  }

  if (score >= 80) {
    return "stable";
  }

  if (score >= 70) {
    return "watch";
  }

  return "critical";
}

function averageScore(rows: CriterionHeatmapRow[]) {
  const values = rows
    .map((row) => row.score)
    .filter((score): score is number => score != null);

  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, score) => sum + score, 0) / values.length;
}

export function MetricInsightStrip({
  title,
  description,
  items
}: {
  title: string;
  description: string;
  items: MetricInsightItem[];
}) {
  return (
    <section className={`panel ${styles.metricStrip}`} aria-labelledby="analytics-insight-strip-title">
      <div className={styles.metricStripHeader}>
        <div>
          <p className="page-kicker">Интеллект периода</p>
          <h2 id="analytics-insight-strip-title">{title}</h2>
        </div>
        <p className={styles.metricStripDescription}>{description}</p>
      </div>

      <div className={styles.metricStripItems}>
        {items.map((item) => {
          const progress = roundedProgress(item.progress);
          const className = [
            styles.metricInsight,
            metricToneClass[item.tone ?? "neutral"],
            item.href ? styles.metricInsightLink : ""
          ].filter(Boolean).join(" ");
          return (
            <article key={item.label} className={className}>
              <div className={styles.metricInsightTopline}>
                <span className={styles.metricInsightLabel}>
                  <span>{item.label}</span>
                  {item.explanation ? (
                    <HelpTooltip
                      label={item.explanationLabel ?? `Что значит сигнал ${item.label}?`}
                      content={item.explanation}
                      placement="top-start"
                    />
                  ) : null}
                </span>
                <strong>{item.value}</strong>
              </div>
              <p>{item.detail}</p>
              {progress == null ? (
                <div className={styles.metricProgressUnavailable}>
                  <span>{item.progressLabel}</span>
                  <strong>нет данных</strong>
                </div>
              ) : (
                <div className={styles.metricProgress}>
                  <div className={styles.metricProgressCaption}>
                    <span>{item.progressLabel}</span>
                    <strong>{formatProgress(item.progress)}</strong>
                  </div>
                  <div
                    aria-label={`${item.label}: ${item.progressLabel}, ${progress}%`}
                    aria-valuemax={100}
                    aria-valuemin={0}
                    aria-valuenow={progress}
                    className={styles.metricProgressTrack}
                    role="progressbar"
                  >
                    <span className={styles.metricProgressFill} style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}
              {item.href ? (
                <Link href={item.href} className={styles.metricInsightAction}>
                  Открыть срез
                  <span className="sr-only"> {item.label}</span>
                </Link>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function CriterionHeatmapPanel({
  title,
  description,
  rows,
  actionHref,
  actionLabel = "Разрезы"
}: {
  title: string;
  description: string;
  rows: CriterionHeatmapRow[];
  actionHref: string;
  actionLabel?: string;
}) {
  const sortedRows = [...rows].sort((left, right) => {
    if (left.score == null && right.score == null) {
      return left.label.localeCompare(right.label, "ru");
    }

    if (left.score == null) {
      return 1;
    }

    if (right.score == null) {
      return -1;
    }

    return left.score - right.score || left.label.localeCompare(right.label, "ru");
  });
  const evaluatedRows = sortedRows.filter((row) => row.score != null);
  const average = averageScore(sortedRows);
  const weakest = evaluatedRows[0];
  const totalEvaluations = sortedRows.reduce((sum, row) => sum + row.count, 0);

  return (
    <section className={`panel ${styles.criterionPanel}`} aria-labelledby="criterion-heatmap-title">
      <div className={styles.criterionHeader}>
        <div className={styles.criterionHeaderCopy}>
          <h2 id="criterion-heatmap-title">{title}</h2>
          <p>{description}</p>
        </div>
        <Link href={actionHref} className="chart-panel__action">
          {actionLabel}
        </Link>
      </div>

      <div className={styles.criterionBody}>
        <div className={styles.criterionSummary} aria-label="Сводка карты критериев">
          <article>
            <span>Среднее по блокам</span>
            <strong>{average == null ? "Нет данных" : formatQualityScore(average)}</strong>
            <small>{sortedRows.length > 0 ? `${sortedRows.length} блоков в карте` : "Блоки появятся после оценок"}</small>
          </article>
          <article>
            <span>Слабая зона</span>
            <strong>{weakest ? weakest.label : "Нет данных"}</strong>
            <small>{weakest ? `${formatQualityScore(weakest.score ?? 0)}, ${weakest.detail}` : "Пока нет оцененных критериев"}</small>
          </article>
          <article>
            <span>Оценки критериев</span>
            <strong>{totalEvaluations}</strong>
            <small>Нормализованные баллы по оцененным критериям</small>
          </article>
        </div>

        {sortedRows.length > 0 ? (
          <>
            <div className={styles.heatmapGrid} role="list" aria-label="Тепловая карта блоков критериев">
              {sortedRows.map((row) => {
                const score = row.score == null ? null : Math.round(row.score);
                const progress = roundedProgress(score);
                const tone = heatmapTone(score);

                return (
                  <article
                    key={row.label}
                    className={`${styles.heatmapCell} ${heatmapToneClass[tone]}`}
                    role="listitem"
                  >
                    <div className={styles.heatmapCellHeader}>
                      <h3>{row.label}</h3>
                      <strong>{score == null ? "--" : formatQualityScore(score)}</strong>
                    </div>
                    <div
                      aria-label={`${row.label}: ${score == null ? "нет данных" : formatQualityScore(score)}`}
                      aria-valuemax={100}
                      aria-valuemin={0}
                      aria-valuenow={progress ?? undefined}
                      className={styles.heatmapMeter}
                      role={progress == null ? undefined : "progressbar"}
                    >
                      <span style={{ width: `${progress ?? 0}%` }} />
                    </div>
                    <p>{row.detail}</p>
                  </article>
                );
              })}
            </div>

            <div className={styles.heatmapLegend} aria-label="Легенда карты критериев">
              <span><i className={styles.legendExcellent} />90-100</span>
              <span><i className={styles.legendStable} />80-89</span>
              <span><i className={styles.legendWatch} />70-79</span>
              <span><i className={styles.legendCritical} />0-69</span>
            </div>
          </>
        ) : (
          <div className={styles.emptyState}>
            Нет оцененных критериев за выбранный период.
          </div>
        )}
      </div>
    </section>
  );
}
