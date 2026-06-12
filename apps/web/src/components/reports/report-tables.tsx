import Link from "next/link";
import type { ReportPeriod } from "@/lib/report-period";
import type { BreakdownRow, ReviewForReport } from "@/lib/reports/report-aggregation";
import { formatAverageScore, reportReviewHref } from "@/lib/reports/report-format";
import { formatQualityScoreDelta } from "@/lib/score-display";

export function BreakdownTable({
  id,
  title,
  rows,
  countLabel,
  showAverage = false,
  actionLabel = "Открыть проверки"
}: {
  id?: string;
  title: string;
  rows: BreakdownRow[];
  countLabel: string;
  showAverage?: boolean;
  actionLabel?: string;
}) {
  return (
    <section id={id} className="panel overflow-clip breakdown-panel">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {rows.length > 0 ? `${rows.length} строк в разрезе` : "Нет данных для выбранного периода"}
        </p>
      </div>
      <div className="record-list px-5">
        {rows.length > 0 ? (
          rows.map((row) => (
            <article key={row.label} className="record-card">
              <div className="record-row">
                <h3 className="record-title">{row.label}</h3>
                <span className="pill pill--neutral">
                  {row.count} {countLabel.toLowerCase()}
                </span>
              </div>
              {showAverage ? (
                <p className="record-meta">
                  Средняя оценка: {formatAverageScore(row.averageScore)}
                  {row.delta != null && row.delta !== 0 ? (
                    <span className={`delta-chip delta-chip--${row.delta > 0 ? "up" : "down"}`}>
                      {formatQualityScoreDelta(row.delta)}
                    </span>
                  ) : null}
                </p>
              ) : null}
              {row.href ? (
                <Link href={row.href} className="record-card__action">
                  {actionLabel}
                </Link>
              ) : null}
            </article>
          ))
        ) : (
          <div className="soft-callout text-sm text-[var(--text-muted)]">
            Нет завершенных проверок.
          </div>
        )}
      </div>
    </section>
  );
}

export function QuotaTable({
  id,
  quotas,
  reviews,
  period
}: {
  id?: string;
  quotas: Array<{
    assigneeName: string;
    supportLine: string | null;
    plannedCount: number;
    dsatTargetPercent: number;
    absenceDays: number;
    note: string | null;
  }>;
  reviews: ReviewForReport[];
  period: ReportPeriod;
}) {
  return (
    <section id={id} className="panel overflow-clip breakdown-panel quota-table-panel">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h2 className="text-lg font-semibold">Нормы проверок</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">План, факт и доля негативного CSAT по операторам.</p>
      </div>
      <div className="record-list px-5">
        {quotas.length > 0 ? (
          quotas.map((quota) => {
            const actualReviews = reviews.filter(
              (review) =>
                review.conversation.assigneeName === quota.assigneeName &&
                (quota.supportLine ? review.conversation.supportLine === quota.supportLine : true)
            );
            const dsatCount = actualReviews.filter((review) => review.conversation.csatBucket === "NEGATIVE").length;
            const remaining = Math.max(0, quota.plannedCount - actualReviews.length);
            const dsatPercent = actualReviews.length > 0 ? Math.round((dsatCount / actualReviews.length) * 100) : 0;
            const quotaStatus =
              actualReviews.length < 10
                ? "Меньше 10 - оценка не считается"
                : remaining > 0
                  ? "Нужно добрать"
                  : "Норма выполнена";
            const href = reportReviewHref(period, {
              assignee: quota.assigneeName,
              ...(quota.supportLine ? { supportLine: quota.supportLine } : {})
            });

            return (
              <article key={`${quota.assigneeName}:${quota.supportLine ?? ""}`} className="record-card">
                <div className="record-row">
                  <div className="min-w-0">
                    <h3 className="record-title">{quota.assigneeName}</h3>
                    <p className="record-meta mt-1">Линия: {quota.supportLine ?? "Не указана"}</p>
                  </div>
                  <span className={`pill ${remaining > 0 ? "pill--warn" : "pill--ok"}`}>{quotaStatus}</span>
                </div>
                <p className="record-meta">
                  План: {quota.plannedCount}, факт: {actualReviews.length}, осталось: {remaining}, DSAT: {dsatCount} ({dsatPercent}%) / цель {quota.dsatTargetPercent}%
                </p>
                {quota.absenceDays > 0 || quota.note ? (
                  <p className="record-meta compact-text">
                    {quota.absenceDays > 0 ? `Отсутствий: ${quota.absenceDays}. ` : ""}
                    {quota.note ?? ""}
                  </p>
                ) : null}
                <Link href={href} className="record-card__action">
                  Открыть проверки оператора
                </Link>
              </article>
            );
          })
        ) : (
          <div className="soft-callout text-sm text-[var(--text-muted)]">
            Нормы на выбранный период пока не заданы.
          </div>
        )}
      </div>
    </section>
  );
}
