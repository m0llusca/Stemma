import Link from "next/link";
import { QueueAdvancedFilters } from "@/components/review/queue-advanced-filters";
import { AutoSubmitFilterForm } from "@/components/ui/auto-submit-filter-form";
import { StatusChip } from "@/components/ui/status-chip";
import {
  channelLabels,
  csatBucketLabels,
  appealStatusLabels,
  feedbackStatusLabels,
  qaStatusLabels,
  reanswerStatusLabels,
  reviewQueueStatusLabels,
  riskLevelLabels,
  samplingTypeLabels
} from "@/lib/labels";
import type { ReviewQueueFilters } from "@/lib/review-repository";
import { queueCsatBuckets, queueProcessFilters, queueSamplingTypes, reviewQueueStatuses } from "@/lib/review-repository";

type QueueFiltersProps = {
  filters: ReviewQueueFilters;
  sources: string[];
  assignees: string[];
  qaAssignees: string[];
  supportLines: string[];
  teamNames: string[];
};

const exactQueueFilterParameters = [
  "channel",
  "source",
  "assignee",
  "qaAssignee",
  "samplingType",
  "csatBucket",
  "supportLine",
  "teamName",
  "process",
  "due",
  "riskLevel"
] satisfies readonly (keyof ReviewQueueFilters)[];

export function QueueFilters({ filters, sources, assignees, qaAssignees, supportLines, teamNames }: QueueFiltersProps) {
  const advancedFilterValues = [
    filters.channel,
    filters.source,
    filters.assignee,
    filters.qaAssignee,
    filters.samplingType,
    filters.csatBucket,
    filters.supportLine,
    filters.teamName,
    filters.process,
    filters.due,
    filters.riskLevel,
    filters.coachingStatus,
    filters.findingCategory,
    filters.criticalCategory,
    filters.feedbackStatus,
    filters.appealStatus,
    filters.reanswerStatus,
    filters.finalizedFrom,
    filters.finalizedTo
  ];
  const activeAdvancedFilterCount = advancedFilterValues.filter(Boolean).length;
  const hasAdvancedFilters = activeAdvancedFilterCount > 0;
  const processLabels = {
    critical: "Критические ошибки",
    reanswer: "Переответы",
    appeal: "Апелляции"
  } as const;
  const riskLevels = ["HIGH_OR_CRITICAL", "CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
  const riskFilterLabels = {
    HIGH_OR_CRITICAL: "Высокий и критический",
    ...riskLevelLabels
  } as const;
  const activeFilters = [
    filters.q ? { label: "Поиск", value: filters.q } : null,
    filters.status !== "all" ? { label: "Статус", value: reviewQueueStatusLabels[filters.status] } : null,
    filters.qaStatus ? { label: "Состояние", value: qaStatusLabels[filters.qaStatus] } : null,
    filters.channel ? { label: "Канал", value: channelLabels[filters.channel] } : null,
    filters.source ? { label: "Источник", value: filters.source } : null,
    filters.assignee ? { label: "Оператор", value: filters.assignee } : null,
    filters.qaAssignee ? { label: "Проверяющий", value: filters.qaAssignee } : null,
    filters.samplingType ? { label: "Выборка", value: samplingTypeLabels[filters.samplingType] ?? filters.samplingType } : null,
    filters.csatBucket ? { label: "CSAT", value: csatBucketLabels[filters.csatBucket] ?? filters.csatBucket } : null,
    filters.supportLine ? { label: "Линия", value: filters.supportLine } : null,
    filters.teamName ? { label: "Команда", value: filters.teamName } : null,
    filters.process ? { label: "Процесс", value: processLabels[filters.process] } : null,
    filters.due ? { label: "Срок", value: "Просрочено" } : null,
    filters.riskLevel ? { label: "Риск", value: riskFilterLabels[filters.riskLevel] } : null,
    filters.coachingStatus ? { label: "Разбор", value: "Открыт" } : null,
    filters.findingCategory ? { label: "Категория", value: filters.findingCategory } : null,
    filters.criticalCategory ? { label: "Критическая ошибка", value: filters.criticalCategory } : null,
    filters.feedbackStatus ? { label: "Обратная связь", value: feedbackStatusLabels[filters.feedbackStatus] ?? filters.feedbackStatus } : null,
    filters.appealStatus ? { label: "Апелляция", value: appealStatusLabels[filters.appealStatus] ?? filters.appealStatus } : null,
    filters.reanswerStatus ? { label: "Переответ", value: reanswerStatusLabels[filters.reanswerStatus] ?? filters.reanswerStatus } : null,
    filters.finalizedFrom ? { label: "Период с", value: filters.finalizedFrom.toLocaleDateString("ru-RU") } : null,
    filters.finalizedTo ? { label: "Период по", value: filters.finalizedTo.toLocaleDateString("ru-RU") } : null
  ].filter((filter): filter is { label: string; value: string } => Boolean(filter));

  return (
    <AutoSubmitFilterForm action="/reviews" className="queue-filterbar">
      <div className="queue-filterbar__primary">
        <label className="grid gap-1 text-sm font-medium text-[#334155]">
          Поиск
          <input
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="Клиент, тема, тег или внешний ID"
            className="form-control"
          />
        </label>

        <label className="grid gap-1 text-sm font-medium text-[#334155]">
          Статус проверки
          <select name="status" defaultValue={filters.status} className="form-control">
            {reviewQueueStatuses.map((status) => (
              <option key={status} value={status}>
                {reviewQueueStatusLabels[status]}
              </option>
            ))}
          </select>
        </label>

        <QueueAdvancedFilters
          activeCount={activeAdvancedFilterCount}
          parameterCount={exactQueueFilterParameters.length}
          defaultOpen={hasAdvancedFilters}
          actions={
            <div className="queue-filterbar__actions">
              <Link href="/reviews" className="action-button">
                Сбросить
              </Link>
            </div>
          }
        >
          <div className="queue-filterbar__advanced-grid">
            <label className="grid gap-1 text-sm font-medium text-[#334155]">
              Канал
              <select name="channel" defaultValue={filters.channel ?? ""} className="form-control">
                <option value="">Все</option>
                {Object.entries(channelLabels).map(([channel, label]) => (
                  <option key={channel} value={channel}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm font-medium text-[#334155]">
              Источник
              <select name="source" defaultValue={filters.source ?? ""} className="form-control">
                <option value="">Все</option>
                {sources.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm font-medium text-[#334155]">
              Оператор
              <select name="assignee" defaultValue={filters.assignee ?? ""} className="form-control">
                <option value="">Все</option>
                {assignees.map((assignee) => (
                  <option key={assignee} value={assignee}>
                    {assignee}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm font-medium text-[#334155]">
              Проверяющий
              <select name="qaAssignee" defaultValue={filters.qaAssignee ?? ""} className="form-control">
                <option value="">Все</option>
                {qaAssignees.map((qaAssignee) => (
                  <option key={qaAssignee} value={qaAssignee}>
                    {qaAssignee}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm font-medium text-[#334155]">
              Выборка
              <select name="samplingType" defaultValue={filters.samplingType ?? ""} className="form-control">
                <option value="">Все</option>
                {queueSamplingTypes.map((samplingType) => (
                  <option key={samplingType} value={samplingType}>
                    {samplingTypeLabels[samplingType]}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm font-medium text-[#334155]">
              CSAT
              <select name="csatBucket" defaultValue={filters.csatBucket ?? ""} className="form-control">
                <option value="">Все</option>
                {queueCsatBuckets.map((csatBucket) => (
                  <option key={csatBucket} value={csatBucket}>
                    {csatBucketLabels[csatBucket]}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm font-medium text-[#334155]">
              Линия
              <select name="supportLine" defaultValue={filters.supportLine ?? ""} className="form-control">
                <option value="">Все</option>
                {supportLines.map((supportLine) => (
                  <option key={supportLine} value={supportLine}>
                    {supportLine}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm font-medium text-[#334155]">
              Команда
              <select name="teamName" defaultValue={filters.teamName ?? ""} className="form-control">
                <option value="">Все</option>
                {teamNames.map((teamName) => (
                  <option key={teamName} value={teamName}>
                    {teamName}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm font-medium text-[#334155]">
              Процесс
              <select name="process" defaultValue={filters.process ?? ""} className="form-control">
                <option value="">Все</option>
                {queueProcessFilters.map((process) => (
                  <option key={process} value={process}>
                    {processLabels[process]}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm font-medium text-[#334155]">
              Срок
              <select name="due" defaultValue={filters.due ?? ""} className="form-control">
                <option value="">Все</option>
                <option value="overdue">Просрочено</option>
              </select>
            </label>

            <label className="grid gap-1 text-sm font-medium text-[#334155]">
              Риск
              <select name="riskLevel" defaultValue={filters.riskLevel ?? ""} className="form-control">
                <option value="">Все</option>
                {riskLevels.map((riskLevel) => (
                  <option key={riskLevel} value={riskLevel}>
                    {riskFilterLabels[riskLevel]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </QueueAdvancedFilters>
      </div>

      {activeFilters.length > 0 ? (
        <div className="queue-filterbar__active">
          {activeFilters.map((filter) => (
            <StatusChip key={`${filter.label}:${filter.value}`} tone="accent" size="xs">
              {filter.label}: {filter.value}
            </StatusChip>
          ))}
        </div>
      ) : null}
    </AutoSubmitFilterForm>
  );
}
