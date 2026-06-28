import Link from "next/link";
import type { ReactNode } from "react";
import { Grid2x2 } from "lucide-react";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { EmptyState } from "@/components/ui/empty-state";
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

const metricToneClass: Record<MetricInsightTone, string> = {
  neutral: styles.metricInsightNeutral,
  ok: styles.metricInsightOk,
  warn: styles.metricInsightWarn,
  danger: styles.metricInsightDanger
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

/**
 * Single-hue intensity bucket. The matrix/heatmap stays monochrome: lower
 * scores read as a DENSER ink fill, not a different hue. This is intentionally
 * NOT a green-yellow-red traffic light.
 */
function intensityClass(score: number | null) {
  if (score == null) {
    return styles.matrixCellEmpty;
  }

  if (score >= 90) {
    return styles.matrixCellT1;
  }

  if (score >= 80) {
    return styles.matrixCellT2;
  }

  if (score >= 70) {
    return styles.matrixCellT3;
  }

  return styles.matrixCellT4;
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
            <strong>{average == null ? "—" : formatQualityScore(average)}</strong>
            <small>{sortedRows.length > 0 ? `${sortedRows.length} блоков в карте` : "Блоки появятся после оценок"}</small>
          </article>
          <article>
            <span>Слабая зона</span>
            <strong>{weakest ? weakest.label : "—"}</strong>
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
            <ul className={styles.matrixList} aria-label="Карта блоков критериев">
              {sortedRows.map((row) => {
                const score = row.score == null ? null : Math.round(row.score);
                const progress = roundedProgress(score);

                return (
                  <li key={row.label} className={styles.matrixRow}>
                    <div className={styles.matrixRowHead}>
                      <span className={styles.matrixRowLabel}>{row.label}</span>
                      <span className={styles.matrixRowMeta}>{row.detail}</span>
                    </div>
                    <div className={`${styles.matrixCell} ${intensityClass(score)}`}>
                      <span className={styles.matrixCellValue}>
                        {score == null ? "—" : formatQualityScore(score)}
                      </span>
                      <span
                        aria-label={`${row.label}: ${score == null ? "нет данных" : formatQualityScore(score)}`}
                        aria-valuemax={100}
                        aria-valuemin={0}
                        aria-valuenow={progress ?? undefined}
                        className={styles.matrixCellBar}
                        role={progress == null ? undefined : "progressbar"}
                      >
                        <span style={{ width: `${progress ?? 0}%` }} />
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className={styles.matrixLegend} aria-label="Легенда: насыщенность заливки растет при низком балле">
              <span className={styles.matrixLegendScale} aria-hidden="true">
                <i className={styles.matrixCellT1} />
                <i className={styles.matrixCellT2} />
                <i className={styles.matrixCellT3} />
                <i className={styles.matrixCellT4} />
              </span>
              <span>Выше балл — светлее, ниже балл — плотнее заливка</span>
            </div>
          </>
        ) : (
          <EmptyState
            icon={<Grid2x2 size={22} aria-hidden="true" />}
            title="Нет оцененных критериев"
            description="Блоки критериев появятся после первых завершенных проверок за период."
            size="inline"
          />
        )}
      </div>
    </section>
  );
}
