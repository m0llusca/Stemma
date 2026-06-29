import Link from "next/link";
import { Download } from "lucide-react";
import { AutoSubmitFilterForm } from "@/components/ui/auto-submit-filter-form";
import { reportDateInputValue, reportPeriodUsesCustomDates, type ReportPeriod } from "@/lib/report-period";
import type { ReportTrendGranularity } from "@/lib/report-trends";
import {
  formatPeriod,
  reportExportFormatHref,
  reportExportHref,
  type ReportView
} from "@/lib/reports/report-format";

/**
 * Export menu — sits in the PageShell `actions` slot. A quiet details/summary
 * popover with CSV / XLSX / PDF links. All behavior (hrefs) preserved.
 */
export function ReportExportMenu({ period }: { period: ReportPeriod }) {
  return (
    <details className="report-export-menu">
      <summary className="action-button">
        <Download size={16} aria-hidden="true" />
        Экспорт
      </summary>
      <div className="report-export-menu__panel">
        <Link href={reportExportHref(period)}>CSV</Link>
        <Link href={reportExportFormatHref(period, "xlsx")}>XLSX</Link>
        <Link href={reportExportFormatHref(period, "pdf")}>PDF</Link>
      </div>
    </details>
  );
}

/**
 * Period control strip — the analytics cockpit's contextual filter row. A clean
 * card holding the period preset (+ optional custom dates), the trend
 * granularity, the resolved range and the comparison baseline. Auto-submits on
 * change. All field names / hrefs / form action preserved.
 */
export function ReportPeriodControls({
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

  return (
    <section className="report-period-controls" aria-label="Настройки аналитики">
      <AutoSubmitFilterForm
        action="/reports"
        className={`report-period-controls__form ${showDateInputs ? "report-period-controls__form--custom" : ""}`}
      >
        <input type="hidden" name="view" value={view} />
        <label className="report-period-controls__field">
          <span className="report-period-controls__label-text">Период</span>
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
            <label className="report-period-controls__field">
              <span className="report-period-controls__label-text">С даты</span>
              <input
                name="start"
                type="date"
                defaultValue={reportDateInputValue(period.start)}
                className="form-control"
              />
            </label>
            <label className="report-period-controls__field">
              <span className="report-period-controls__label-text">По дату</span>
              <input
                name="end"
                type="date"
                defaultValue={reportDateInputValue(period.end)}
                className="form-control"
              />
            </label>
          </>
        ) : (
          <div className="report-period-controls__range" aria-label={`Диапазон периода: ${formatPeriod(period)}`}>
            <span>Диапазон</span>
            <strong>{formatPeriod(period)}</strong>
          </div>
        )}
        <label className="report-period-controls__field">
          <span className="report-period-controls__label-text">График</span>
          <select name="trend" defaultValue={trendGranularity} className="form-control">
            <option value="day">По дням</option>
            <option value="week">По неделям</option>
            <option value="month">По месяцам</option>
          </select>
        </label>
      </AutoSubmitFilterForm>

      <div className="report-period-controls__meta">
        <span>{period.label}: {formatPeriod(period)}</span>
        <span>Сравнение: {formatPeriod(previousPeriod)}</span>
      </div>
    </section>
  );
}
