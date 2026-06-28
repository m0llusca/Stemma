import Link from "next/link";
import { Inbox } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
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
      <div className="breakdown-panel__header">
        <h2 className="breakdown-panel__title">{title}</h2>
        <p className="breakdown-panel__meta">
          {rows.length > 0 ? `${rows.length} строк в разрезе` : "Нет данных для выбранного периода"}
        </p>
      </div>
      <div className="record-list px-5">
        {rows.length > 0 ? (
          rows.map((row) => (
            <article key={row.label} className="record-card">
              <div className="record-row">
                <h3 className="record-title">{row.label}</h3>
                <Chip tone="neutral" size="sm" numeric value={row.count} label={countLabel.toLowerCase()} />
              </div>
              {showAverage ? (
                <p className="record-meta record-meta--inline">
                  <span className="record-meta__label">Средняя оценка</span>
                  <span className="record-meta__value tabular-nums">{formatAverageScore(row.averageScore)}</span>
                  {row.delta != null && row.delta !== 0 ? (
                    <Chip tone={row.delta > 0 ? "success" : "danger"} size="xs" numeric>
                      {formatQualityScoreDelta(row.delta)}
                    </Chip>
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
          <EmptyState
            icon={<Inbox size={22} aria-hidden="true" />}
            title="Нет завершенных проверок"
            size="inline"
          />
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
      <div className="breakdown-panel__header">
        <h2 className="breakdown-panel__title">Нормы проверок</h2>
        <p className="breakdown-panel__meta">План, факт и доля негативного CSAT по операторам.</p>
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
            const statusTone = actualReviews.length < 10 ? "neutral" : remaining > 0 ? "warning" : "success";
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
                  <Chip tone={statusTone} size="sm">{quotaStatus}</Chip>
                </div>
                <p className="record-meta tabular-nums">
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
          <EmptyState
            icon={<Inbox size={22} aria-hidden="true" />}
            title="Нормы не заданы"
            description="Нормы проверок на выбранный период пока не настроены."
            size="inline"
          />
        )}
      </div>
    </section>
  );
}
