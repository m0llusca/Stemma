import { CalendarClock } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/loading-states";
import { ReportScheduleForm } from "@/components/admin/report-schedule-form";
import { Chip } from "@/components/ui/chip";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageShell } from "@/components/ui/page-shell";
import { AdminDialog } from "@/components/admin/admin-dialog";
import { AdminFrame } from "@/components/admin/admin-frame";
import { adminEyebrow, adminLoadingLabel, adminSectionTitles } from "@/lib/admin-sections";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { deleteReportSchedule, setReportScheduleActive } from "@/lib/report-schedule-actions";
import {
  REPORT_SCHEDULE_CADENCES,
  REPORT_SCHEDULE_FORMATS,
  REPORT_SCHEDULE_PERIOD_PRESETS
} from "@/lib/report-schedule";

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
        <section className="ops-panel" aria-labelledby="report-schedules-title">
          <div className="ops-panel__header">
            <div>
              <p className="ops-panel__eyebrow">Расписания</p>
              <h2 id="report-schedules-title" className="ops-panel__title">
                Регулярные выгрузки
              </h2>
              <p className="ops-panel__subtitle">
                Активно: {activeCount} · всего: {schedules.length}
              </p>
            </div>
            <div className="admin-actions">
              <AdminDialog
                triggerLabel={
                  <>
                    <CalendarClock size={16} aria-hidden="true" />
                    Новое расписание
                  </>
                }
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
              <Link href="/reports" className="action-button">
                Отчеты
              </Link>
            </div>
          </div>
          <div className="p-4">
            {schedules.length > 0 ? (
              <div className="admin-data-table admin-data-table--schedules" aria-label="Расписания отчетов">
                <div className="admin-data-table__head">
                  <span>Расписание</span>
                  <span>Периодичность</span>
                  <span>Формат</span>
                  <span>Следующий запуск</span>
                </div>
                {schedules.map((schedule) => (
                  <div key={schedule.id} className="admin-data-table__row">
                    <span className="admin-data-table__primary admin-data-table__primary--stacked">
                      <strong>{schedule.name}</strong>
                      <span className="admin-data-table__inline-actions">
                        <Chip tone={schedule.isActive ? "success" : "neutral"} size="xs">
                          {schedule.isActive ? "Активно" : "Выключено"}
                        </Chip>
                        <small className="admin-data-table__muted">
                          {periodPresetLabels[schedule.periodPreset] ?? schedule.periodPreset}
                        </small>
                      </span>
                    </span>
                    <span>{cadenceLabels[schedule.cadence] ?? schedule.cadence}</span>
                    <span>{formatLabels[schedule.exportFormat] ?? schedule.exportFormat.toUpperCase()}</span>
                    <span className="admin-data-table__stack">
                      <strong className="tabular-nums">{formatDateTime(schedule.nextRunAt)}</strong>
                      <span className="admin-data-table__inline-actions">
                        <form action={setReportScheduleActive}>
                          <input type="hidden" name="scheduleId" value={schedule.id} />
                          <input type="hidden" name="isActive" value={schedule.isActive ? "false" : "true"} />
                          <button type="submit" className="quiet-link text-sm">
                            {schedule.isActive ? "Выключить" : "Включить"}
                          </button>
                        </form>
                        <form action={deleteReportSchedule}>
                          <input type="hidden" name="scheduleId" value={schedule.id} />
                          <ConfirmSubmitButton
                            className="quiet-link quiet-link--danger text-sm"
                            confirmMessage={`Удалить расписание «${schedule.name}»? Регулярная выгрузка остановится, расписание будет удалено безвозвратно. Уже созданные отчеты останутся в снимках.`}
                          >
                            Удалить
                          </ConfirmSubmitButton>
                        </form>
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                size="inline"
                icon={<CalendarClock size={20} aria-hidden="true" />}
                title="Расписаний пока нет"
                description="Создайте расписание, чтобы отчеты по качеству формировались автоматически без ручной выгрузки."
              />
            )}
          </div>
        </section>
      </AdminFrame>
    </PageShell>
  );
}
