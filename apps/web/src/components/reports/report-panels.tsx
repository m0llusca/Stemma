import Link from "next/link";
import { CalendarDays, RotateCcw, Scale } from "lucide-react";
import type { ReportPeriod } from "@/lib/report-period";
import type { ImprovementHighlight } from "@/lib/report-improvements";
import { formatQualityScore, formatQualityScoreDelta } from "@/lib/score-display";
import type { BreakdownRow } from "@/lib/reports/report-aggregation";
import {
  formatReviewCount,
  reportHref,
  reportReviewHref,
  sampleInsight
} from "@/lib/reports/report-format";

export type DetailsIndexItem = {
  label: string;
  value: string;
  detail: string;
  href: string;
};

export type FocusItem = {
  label: string;
  value: string;
  detail: string;
  href?: string;
  actionLabel?: string;
};

export type ReportFocusItem = {
  label: string;
  value: string;
  detail: string;
  href?: string;
  tone?: "neutral" | "ok" | "warn" | "danger";
};

export type DriverChainItem = {
  label: string;
  value: string;
  evidence: string;
  action: string;
  href?: string;
};

export function ProcessSummary({
  criticalCount,
  reanswerCount,
  appealCount,
  period
}: {
  criticalCount: number;
  reanswerCount: number;
  appealCount: number;
  period: ReportPeriod;
}) {
  const items = [
    { label: "Критические ошибки", value: criticalCount, detail: "Обнуляют оценку", icon: Scale, tone: "danger", href: reportReviewHref(period, { process: "critical" }) },
    { label: "Переответы", value: reanswerCount, detail: "Нужен новый ответ", icon: RotateCcw, tone: "warn", href: reportReviewHref(period, { process: "reanswer" }) },
    { label: "Апелляции", value: appealCount, detail: "Споры по оценке", icon: CalendarDays, tone: "neutral", href: reportReviewHref(period, { process: "appeal" }) }
  ];

  return (
    <section className="panel process-summary overflow-clip">
      <div className="process-summary__layout">
        <div className="process-summary__lead">
          <p className="page-kicker">Процесс</p>
          <h2>Контроль процесса</h2>
          <p>Эскалации, которые требуют управленческого внимания.</p>
        </div>
        <dl className="process-summary__list">
          {items.map((item) => {
            const Icon = item.icon;

            return (
              <Link key={item.label} href={item.href} className={`process-summary__item process-summary__item--${item.tone}`}>
                <span className="process-summary__icon">
                  <Icon size={17} aria-hidden="true" />
                </span>
                <div>
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                  <p>{item.detail}</p>
                </div>
              </Link>
            );
          })}
        </dl>
      </div>
    </section>
  );
}

export function DetailsIndexPanel({ items }: { items: DetailsIndexItem[] }) {
  return (
    <aside className="panel details-index-panel">
      <div>
        <p className="page-kicker">Навигация по разрезам</p>
        <h2>Быстрый переход</h2>
        <p>Таблицы ниже сгруппированы по задачам разбора: критерии, норма, источники, люди и статусы.</p>
      </div>
      <nav aria-label="Разрезы аналитики" className="details-index-panel__nav">
        {items.map((item) => (
          <a key={item.href} href={item.href} className="details-index-panel__item">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.detail}</small>
          </a>
        ))}
      </nav>
    </aside>
  );
}

export function ReportFocusPanel({
  kicker,
  title,
  description,
  actionHref,
  actionLabel,
  items
}: {
  kicker: string;
  title: string;
  description: string;
  actionHref: string;
  actionLabel: string;
  items: ReportFocusItem[];
}) {
  return (
    <section className="panel report-focus-panel">
      <div className="report-focus-panel__header">
        <div className="min-w-0">
          <p className="page-kicker">{kicker}</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <Link href={actionHref} className="chart-panel__action">
          {actionLabel}
        </Link>
      </div>
      <div className="report-focus-panel__grid">
        {items.map((item) => {
          const content = (
            <>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.detail}</small>
            </>
          );
          const className = `report-focus-panel__item report-focus-panel__item--${item.tone ?? "neutral"}`;

          return item.href ? (
            <Link key={item.label} href={item.href} className={className}>
              {content}
            </Link>
          ) : (
            <article key={item.label} className={className}>
              {content}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function MovementHighlightGrid({
  items,
  tone,
  emptyTitle,
  emptyBody
}: {
  items: ImprovementHighlight[];
  tone: "negative" | "positive";
  emptyTitle: string;
  emptyBody: string;
}) {
  if (items.length === 0) {
    return (
      <div className="improvement-panel__empty">
        <strong>{emptyTitle}</strong>
        <span>{emptyBody}</span>
      </div>
    );
  }

  return (
    <div className={`improvement-panel__grid improvement-panel__grid--${tone}`}>
      {items.map((item) => {
        const content = (
          <>
            <span>{item.scope}</span>
            <strong>{item.label}</strong>
            <small>
              {formatQualityScore(item.currentScore)}, {formatQualityScoreDelta(item.delta)} к прошлому периоду, {formatReviewCount(item.count)}
            </small>
          </>
        );
        const className = `improvement-panel__item improvement-panel__item--${tone}`;

        return item.href ? (
          <Link key={`${tone}:${item.scope}:${item.label}`} href={item.href} className={className}>
            {content}
          </Link>
        ) : (
          <article key={`${tone}:${item.scope}:${item.label}`} className={className}>
            {content}
          </article>
        );
      })}
    </div>
  );
}

export function PeriodMovementPanel({
  negativeItems,
  positiveItems,
  driverItems
}: {
  negativeItems: ImprovementHighlight[];
  positiveItems: ImprovementHighlight[];
  driverItems: DriverChainItem[];
}) {
  return (
    <section className="panel improvement-panel" aria-labelledby="analytics-movement-title">
      <div className="improvement-panel__header">
        <div>
          <p className="page-kicker">Динамика периода</p>
          <h2 id="analytics-movement-title">Что изменилось и почему</h2>
          <p>Сначала просадки и улучшения к сопоставимому прошлому периоду, затем цепочка драйверов — где искать причину и что сделать.</p>
        </div>
      </div>

      <div className="improvement-panel__sections">
        <div className="improvement-panel__section">
          <div className="improvement-panel__section-header">
            <strong>Негативные факторы</strong>
            <span>Что просело сильнее всего</span>
          </div>
          <MovementHighlightGrid
            items={negativeItems}
            tone="negative"
            emptyTitle="Просадок к прошлому периоду нет"
            emptyBody="Все сопоставимые срезы удержали или улучшили средний балл."
          />
        </div>
        <div className="improvement-panel__section">
          <div className="improvement-panel__section-header">
            <strong>Позитивные факторы</strong>
            <span>Что стало лучше</span>
          </div>
          <MovementHighlightGrid
            items={positiveItems}
            tone="positive"
            emptyTitle="Пока нет устойчивого улучшения"
            emptyBody="Появится, когда срез в текущем периоде будет выше прошлого по среднему баллу."
          />
        </div>
        {driverItems.length > 0 ? (
          <div className="improvement-panel__section">
            <div className="improvement-panel__section-header">
              <strong>Где искать причину</strong>
              <span>Слабейшие срезы и следующее действие</span>
            </div>
            <div className="report-driver-stack__items">
              {driverItems.map((item) => {
                const content = (
                  <>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    <small>{item.evidence}</small>
                    <em>{item.action}</em>
                  </>
                );

                return item.href ? (
                  <Link key={`${item.label}:${item.value}`} href={item.href} className="report-driver-item report-driver-item--link">
                    {content}
                  </Link>
                ) : (
                  <div key={`${item.label}:${item.value}`} className="report-driver-item">
                    {content}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function InsightSummary({
  averageScore,
  finalizedCount,
  previousCount,
  topSource,
  period,
  focusItems
}: {
  averageScore: number | null;
  finalizedCount: number;
  previousCount: number;
  topSource?: BreakdownRow;
  period: ReportPeriod;
  focusItems: FocusItem[];
}) {
  const sourceText = topSource
    ? `Основной вклад в выборку: ${formatReviewCount(topSource.count)} из источника ${topSource.label}.`
    : "Источники появятся после первых завершенных проверок.";
  const insightTitle = averageScore == null
    ? "Данные появятся после первых проверок"
    : "Где смотреть сейчас";

  return (
    <section className="panel insight-summary">
      <div className="insight-summary__body">
        <p className="page-kicker">Сводка периода</p>
        <h2>{insightTitle}</h2>
        <p>{sourceText} {sampleInsight(finalizedCount, previousCount)}</p>
      </div>
      <div className="insight-summary__actions">
        <Link href={reportReviewHref(period)} className="action-button action-button--primary">
          Открыть проверки
        </Link>
        <Link href={reportHref(period, { view: "performance" })} className="action-button">
          Сравнить разрезы
        </Link>
      </div>
      <div className="insight-summary__focus" aria-label="Где смотреть сейчас">
        {focusItems.map((row) => {
          const content = (
            <>
              <span>{row.label}</span>
              <strong>{row.value}</strong>
              <small>{row.detail}</small>
            </>
          );

          return row.href ? (
            <Link key={row.label} href={row.href} className="insight-focus-card">
              {content}
            </Link>
          ) : (
            <div key={row.label} className="insight-focus-card insight-focus-card--static">
              {content}
            </div>
          );
        })}
      </div>
    </section>
  );
}
