import Link from "next/link";
import { AutoSubmitFilterForm } from "@/components/ui/auto-submit-filter-form";
import { StickyCommandBarShell } from "@/components/reports/sticky-command-bar-shell";
import { reportDateInputValue, reportPeriodUsesCustomDates, type ReportPeriod } from "@/lib/report-period";
import type { ReportTrendGranularity } from "@/lib/report-trends";
import {
  formatPeriod,
  reportExportFormatHref,
  reportExportHref,
  reportViewHref,
  reportViews,
  type ReportView
} from "@/lib/reports/report-format";

export function ReportCommandBar({
  period,
  previousPeriod,
  view,
  trendGranularity
}: {
  period: ReportPeriod;
  previousPeriod: ReportPeriod;
  view: ReportView;
  trendGranularity: ReportTrendGranularity;
}) {
  const showDateInputs = reportPeriodUsesCustomDates(period);
  const compactPeriodLabel = `${period.label}: ${formatPeriod(period)}`;

  return (
    <StickyCommandBarShell className="report-command-bar" ariaLabel="Настройки аналитики">
      <div className="report-command-bar__title">
        <p className="page-kicker">Контроль качества</p>
        <h1 className="page-title">Аналитика качества</h1>
        <p className="report-command-bar__compact-title">{compactPeriodLabel}</p>
      </div>

      <AutoSubmitFilterForm
        action="/reports"
        className={`report-command-bar__form ${showDateInputs ? "report-command-bar__form--custom" : ""}`}
      >
        <input type="hidden" name="view" value={view} />
        <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
          <span className="report-command-bar__label-text">Период</span>
          <select name="period" defaultValue={period.preset} className="form-control">
            <option value="vk-current">Текущий 22-21</option>
            <option value="vk-previous">Прошлый 22-21</option>
            <option value="calendar-current">Текущий месяц</option>
            <option value="calendar-previous">Прошлый месяц</option>
            <option value="quarter-current">Квартал</option>
            <option value="custom">Произвольный</option>
          </select>
        </label>
        {showDateInputs ? (
          <>
            <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
              <span className="report-command-bar__label-text">С даты</span>
              <input
                name="start"
                type="date"
                defaultValue={reportDateInputValue(period.start)}
                className="form-control"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
              <span className="report-command-bar__label-text">По дату</span>
              <input
                name="end"
                type="date"
                defaultValue={reportDateInputValue(period.end)}
                className="form-control"
              />
            </label>
          </>
        ) : (
          <div className="report-command-bar__range" aria-label={`Диапазон периода: ${formatPeriod(period)}`}>
            <span>Диапазон</span>
            <strong>{formatPeriod(period)}</strong>
          </div>
        )}
        <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
          <span className="report-command-bar__label-text">График</span>
          <select name="trend" defaultValue={trendGranularity} className="form-control">
            <option value="day">По дням</option>
            <option value="week">По неделям</option>
            <option value="month">По месяцам</option>
          </select>
        </label>
      </AutoSubmitFilterForm>

      <div className="report-command-bar__meta">
        <span>{period.label}: {formatPeriod(period)}</span>
        <span>Сравнение: {formatPeriod(previousPeriod)}</span>
      </div>

      <details className="report-export-menu">
        <summary className="action-button">Экспорт</summary>
        <div className="report-export-menu__panel">
          <Link href={reportExportHref(period)}>CSV</Link>
          <Link href={reportExportFormatHref(period, "xlsx")}>XLSX</Link>
          <Link href={reportExportFormatHref(period, "pdf")}>PDF</Link>
        </div>
      </details>
    </StickyCommandBarShell>
  );
}

export function ReportViewSelector({
  period,
  view,
  counts,
  trendGranularity
}: {
  period: ReportPeriod;
  view: ReportView;
  counts: Record<ReportView, number>;
  trendGranularity: ReportTrendGranularity;
}) {
  const activeView = reportViews.find((item) => item.id === view) ?? reportViews[0];

  return (
    <div className="report-view-selector-wrap">
      <nav className="report-view-selector" aria-label="Режим аналитики">
        {reportViews.map((item) => {
          const isActive = item.id === view;

          return (
            <Link
              key={item.id}
              href={reportViewHref(period, item.id, trendGranularity)}
              className={`report-view-selector__item ${isActive ? "report-view-selector__item--active" : ""}`}
              aria-current={isActive ? "page" : undefined}
            >
              <span>{item.label}</span>
              <strong>{counts[item.id]}</strong>
            </Link>
          );
        })}
      </nav>
      <p className="report-view-selector__description">{activeView.description}</p>
    </div>
  );
}
