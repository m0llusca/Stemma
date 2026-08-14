import { CalendarClock } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/loading-states";
import { ReportScheduleForm } from "@/components/admin/report-schedule-form";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageShell } from "@/components/ui/page-shell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { AdminDialog } from "@/components/admin/admin-dialog";
import { AdminFrame } from "@/components/admin/admin-frame";
import { adminEyebrow, adminLoadingLabel, adminSectionTitles } from "@/lib/admin-sections";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { deleteReportSchedule, setReportScheduleActive } from "@/lib/report-schedule-actions";
import { statusSurfaceClass } from "@/lib/ui/status-tone";
import {
  REPORT_SCHEDULE_CADENCES,
  REPORT_SCHEDULE_FORMATS,
  REPORT_SCHEDULE_PERIOD_PRESETS
} from "@/lib/report-schedule";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ReportSchedulesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const periodPresetLabels: Record<string, string> = {
  last_7_days: "Последние 7 дней",
  last_30_days: "Последние 30 дней",
  previous_calendar_month: "Прошлый календарный месяц"
};

const cadenceLabels: Record<string, string> = {
  daily: "Ежедневно",
  weekly: "Еженедельно",
  monthly: "Ежемесячно"
};

const formatLabels: Record<string, string> = {
  xlsx: "XLSX",
  csv: "CSV",
  pdf: "PDF"
};

function formatDateTime(value: Date | null) {
  return value ? value.toLocaleString("ru-RU") : "—";
}

export default function ReportSchedulesPage({ searchParams }: ReportSchedulesPageProps) {
  return (
    <Suspense fallback={<PageSkeleton variant="admin" label={adminLoadingLabel("/admin/report-schedules")} />}>
      <ReportSchedulesPageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ReportSchedulesPageContent({ searchParams }: ReportSchedulesPageProps) {
  const params = await searchParams;
  // Единый deep-link паттерн админки: ?section=create открывает окно создания.
  const sectionParam = Array.isArray(params.section) ? params.section[0] : params.section;
  const createDialogOpen = sectionParam?.trim() === "create";
  const user = await requireCurrentUserPermission("reports:read");
  const schedules = await prisma.reportSchedule.findMany({
    where: { workspaceId: user.workspaceId },
    orderBy: [{ isActive: "desc" }, { nextRunAt: "asc" }, { createdAt: "desc" }]
  });
  const activeCount = schedules.filter((schedule) => schedule.isActive).length;

  return (
    <PageShell
      eyebrow={adminEyebrow}
      title={adminSectionTitles["/admin/report-schedules"]}
      description="Автоматическая регулярная выгрузка отчетов по качеству: формат, период данных и периодичность. Готовые отчеты появляются в снимках вместе с ручными выгрузками."
    >
      <AdminFrame>
        <Card aria-labelledby="report-schedules-title">
          <CardHeader className="border-b">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Расписания</p>
            <CardTitle id="report-schedules-title">
              Регулярные выгрузки
            </CardTitle>
            <CardDescription className="tabular-nums">
              Активно: {activeCount} · всего: {schedules.length}
            </CardDescription>
            <CardAction>
              <div className="flex flex-wrap items-center gap-2">
                <AdminDialog
                  triggerLabel={
                    <>
                      <CalendarClock size={16} aria-hidden="true" />
                      Новое расписание
                    </>
                  }
                  triggerClassName={buttonVariants()}
                  title="Новое расписание"
                  description="Выберите период данных, периодичность и формат регулярной выгрузки."
                  defaultOpen={createDialogOpen}
                >
                  <ReportScheduleForm
                    periodPresetOptions={REPORT_SCHEDULE_PERIOD_PRESETS.map((value) => ({
                      value,
                      label: periodPresetLabels[value] ?? value
                    }))}
                    cadenceOptions={REPORT_SCHEDULE_CADENCES.map((value) => ({
                      value,
                      label: cadenceLabels[value] ?? value
                    }))}
                    formatOptions={REPORT_SCHEDULE_FORMATS.map((value) => ({
                      value,
                      label: formatLabels[value] ?? value
                    }))}
                  />
                </AdminDialog>
                <Button variant="outline" render={<Link href="/reports" />} nativeButton={false}>
                  Отчеты
                </Button>
              </div>
            </CardAction>
          </CardHeader>
          <CardContent className="p-0">
            {schedules.length > 0 ? (
              <Table aria-label="Расписания отчетов">
                <TableHeader>
                  <TableRow>
                    <TableHead>Расписание</TableHead>
                    <TableHead>Периодичность</TableHead>
                    <TableHead>Формат</TableHead>
                    <TableHead>Следующий запуск</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedules.map((schedule) => (
                    <TableRow key={schedule.id} className="align-top">
                      <TableCell>
                        <div className="flex flex-col gap-1.5">
                          <span className="font-medium text-foreground">{schedule.name}</span>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant={schedule.isActive ? "outline" : "secondary"}
                              className={
                                schedule.isActive
                                  ? cn("border-transparent", statusSurfaceClass("positive"))
                                  : undefined
                              }
                            >
                              {schedule.isActive ? "Активно" : "Выключено"}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {periodPresetLabels[schedule.periodPreset] ?? schedule.periodPreset}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{cadenceLabels[schedule.cadence] ?? schedule.cadence}</TableCell>
                      <TableCell>
                        {formatLabels[schedule.exportFormat] ?? schedule.exportFormat.toUpperCase()}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1.5">
                          <strong className="font-medium tabular-nums">{formatDateTime(schedule.nextRunAt)}</strong>
                          <div className="flex flex-wrap items-center gap-2">
                            <form action={setReportScheduleActive}>
                              <input type="hidden" name="scheduleId" value={schedule.id} />
                              <input type="hidden" name="isActive" value={schedule.isActive ? "false" : "true"} />
                              <Button type="submit" variant="link" size="xs" className="h-auto px-0">
                                {schedule.isActive ? "Выключить" : "Включить"}
                              </Button>
                            </form>
                            <form action={deleteReportSchedule}>
                              <input type="hidden" name="scheduleId" value={schedule.id} />
                              <ConfirmSubmitButton
                                className={cn(
                                  buttonVariants({ variant: "link", size: "xs" }),
                                  "h-auto px-0 text-destructive"
                                )}
                                confirmMessage={`Удалить расписание «${schedule.name}»? Регулярная выгрузка остановится, расписание будет удалено безвозвратно. Уже созданные отчеты останутся в снимках.`}
                              >
                                Удалить
                              </ConfirmSubmitButton>
                            </form>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-4">
                <EmptyState
                  size="inline"
                  icon={<CalendarClock size={20} aria-hidden="true" />}
                  title="Расписаний пока нет"
                  description="Создайте расписание, чтобы отчеты по качеству формировались автоматически без ручной выгрузки."
                />
              </div>
            )}
          </CardContent>
        </Card>
      </AdminFrame>
    </PageShell>
  );
}
