import Link from "next/link";
import { Inbox } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import type { ReportPeriod } from "@/lib/report-period";
import type { BreakdownRow, ReviewForReport } from "@/lib/reports/report-aggregation";
import { reportPageLocalLinkProps } from "@/lib/reports/report-evidence-links";
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
    <Card id={id} size="sm" className="h-full gap-0 overflow-clip scroll-mt-24 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {rows.length > 0 ? `${rows.length} строк в разрезе` : "Нет данных для выбранного периода"}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 py-0">
        {rows.length > 0 ? (
          <div
            role="region"
            aria-label={title}
            tabIndex={0}
            data-slot="report-table-scroll-region"
            className="min-w-0 overflow-x-auto outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&>[data-slot=table-container]]:overflow-visible"
          >
            <Table className="min-w-max">
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4">Разрез</TableHead>
                  <TableHead className="px-4 text-right">{countLabel}</TableHead>
                  {showAverage ? <TableHead className="px-4 text-right">Средняя оценка</TableHead> : null}
                  <TableHead className="w-[1%] px-4 text-right">
                    <span className="sr-only">Действие</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.label}>
                    <TableCell className="max-w-[220px] truncate px-4 font-medium">{row.label}</TableCell>
                    <TableCell className="px-4 text-right">
                      <Chip tone="neutral" size="sm" numeric>
                        {row.count} {countLabel.toLowerCase()}
                      </Chip>
                    </TableCell>
                    {showAverage ? (
                      <TableCell className="px-4 text-right">
                        <span className="inline-flex items-center justify-end gap-1.5">
                          <span className="font-semibold tabular-nums text-foreground">
                            {formatAverageScore(row.averageScore)}
                          </span>
                          {row.delta != null && row.delta !== 0 ? (
                            <Chip tone={row.delta > 0 ? "success" : "danger"} size="xs" numeric>
                              {formatQualityScoreDelta(row.delta)}
                            </Chip>
                          ) : null}
                        </span>
                      </TableCell>
                    ) : null}
                    <TableCell className="px-4 text-right">
                      {row.href ? (
                        <Link
                          href={row.href}
                          {...reportPageLocalLinkProps(row.href)}
                          className={buttonVariants({ variant: "outline", size: "xs" })}
                        >
                          {actionLabel}
                        </Link>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="px-4 py-4">
            <EmptyState
              icon={<Inbox size={22} aria-hidden="true" />}
              title="Нет завершенных проверок"
              size="inline"
            />
          </div>
        )}
      </CardContent>
    </Card>
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
    <Card id={id} size="sm" className="h-full gap-0 overflow-clip scroll-mt-24 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle>Нормы проверок</CardTitle>
        <CardDescription>План, факт и доля негативного CSAT по операторам.</CardDescription>
      </CardHeader>
      <CardContent className="px-0 py-0">
        {quotas.length > 0 ? (
          <div
            role="region"
            aria-label="Нормы проверок"
            tabIndex={0}
            data-slot="report-table-scroll-region"
            className="min-w-0 overflow-x-auto outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&>[data-slot=table-container]]:overflow-visible"
          >
            <Table className="min-w-max">
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4">Оператор</TableHead>
                  <TableHead className="px-4">Линия</TableHead>
                  <TableHead className="px-4 text-right">План</TableHead>
                  <TableHead className="px-4 text-right">Факт</TableHead>
                  <TableHead className="px-4 text-right">Осталось</TableHead>
                  <TableHead className="px-4 text-right">DSAT</TableHead>
                  <TableHead className="px-4">Статус</TableHead>
                  <TableHead className="w-[1%] px-4 text-right">
                    <span className="sr-only">Действие</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotas.map((quota) => {
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
                  const noteParts = [
                    quota.absenceDays > 0 ? `Отсутствий: ${quota.absenceDays}` : null,
                    quota.note
                  ].filter(Boolean);

                  return (
                    <TableRow key={`${quota.assigneeName}:${quota.supportLine ?? ""}`}>
                      <TableCell className="max-w-[180px] px-4">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{quota.assigneeName}</p>
                          {noteParts.length > 0 ? (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">{noteParts.join(". ")}</p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 text-muted-foreground">{quota.supportLine ?? "Не указана"}</TableCell>
                      <TableCell className="px-4 text-right tabular-nums">{quota.plannedCount}</TableCell>
                      <TableCell className="px-4 text-right tabular-nums">{actualReviews.length}</TableCell>
                      <TableCell className="px-4 text-right tabular-nums">{remaining}</TableCell>
                      <TableCell className="px-4 text-right tabular-nums">
                        {dsatCount} ({dsatPercent}%) / {quota.dsatTargetPercent}%
                      </TableCell>
                      <TableCell className="px-4">
                        <Chip tone={statusTone} size="sm">
                          {quotaStatus}
                        </Chip>
                      </TableCell>
                      <TableCell className="px-4 text-right">
                        <Link href={href} className={buttonVariants({ variant: "outline", size: "xs" })}>
                          Открыть проверки оператора
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="px-4 py-4">
            <EmptyState
              icon={<Inbox size={22} aria-hidden="true" />}
              title="Нормы не заданы"
              description="Нормы проверок на выбранный период пока не настроены."
              size="inline"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
