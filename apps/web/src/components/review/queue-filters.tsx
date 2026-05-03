import Link from "next/link";
import { StatusChip } from "@/components/ui/status-chip";
import {
  channelLabels,
  csatBucketLabels,
  qaStatusLabels,
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
};

export function QueueFilters({ filters, sources, assignees, qaAssignees, supportLines }: QueueFiltersProps) {
  const hasAdvancedFilters = Boolean(
    filters.channel ||
      filters.source ||
      filters.assignee ||
      filters.qaAssignee ||
      filters.samplingType ||
      filters.csatBucket ||
    filters.supportLine ||
    filters.process ||
    filters.due ||
    filters.riskLevel ||
    filters.finalizedFrom ||
    filters.finalizedTo
  );
  const processLabels = {
    critical: "Критические ошибки",
    reanswer: "Переответы",
    appeal: "Апелляции"
  } as const;
  const riskLevels = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
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
    filters.process ? { label: "Процесс", value: processLabels[filters.process] } : null,
    filters.due ? { label: "Срок", value: "Просрочено" } : null,
    filters.riskLevel ? { label: "Риск", value: riskLevelLabels[filters.riskLevel] } : null,
    filters.finalizedFrom ? { label: "Период с", value: filters.finalizedFrom.toLocaleDateString("ru-RU") } : null,
    filters.finalizedTo ? { label: "Период по", value: filters.finalizedTo.toLocaleDateString("ru-RU") } : null
  ].filter((filter): filter is { label: string; value: string } => Boolean(filter));

  return (
    <form action="/reviews" className="panel overflow-hidden">
      <div className="grid gap-3 p-4 lg:grid-cols-[minmax(260px,1fr)_190px_auto] lg:items-end">
        <label className="grid gap-1 text-sm font-medium text-[#344054]">
          Поиск
          <input
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="Клиент, тема, тег или внешний ID"
            className="form-control"
          />
        </label>

        <label className="grid gap-1 text-sm font-medium text-[#344054]">
          Статус проверки
          <select name="status" defaultValue={filters.status} className="form-control">
            {reviewQueueStatuses.map((status) => (
              <option key={status} value={status}>
                {reviewQueueStatusLabels[status]}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap items-end gap-2 lg:justify-end">
          <button type="submit" className="action-button action-button--primary">
            Применить
          </button>
          <Link href="/reviews" className="action-button">
            Сбросить
          </Link>
        </div>
      </div>

      {activeFilters.length > 0 ? (
        <div className="signal-row border-t border-[#d7dce5] bg-[#fbfcfd] px-4 py-3">
          {activeFilters.map((filter) => (
            <StatusChip key={`${filter.label}:${filter.value}`} tone="accent" size="xs">
              {filter.value}
            </StatusChip>
          ))}
        </div>
      ) : null}

      <details className="disclosure-panel border-t border-[#d7dce5]" open={hasAdvancedFilters}>
        <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[#344054]">
          <span>{hasAdvancedFilters ? "Дополнительные фильтры применены" : "Дополнительные фильтры"}</span>
          <span className="text-xs font-semibold uppercase text-[#667085]">9 параметров</span>
        </summary>

        <div className="grid gap-4 border-t border-[#d7dce5] bg-[#fbfcfd] p-4 md:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-sm font-medium text-[#344054]">
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

          <label className="grid gap-1 text-sm font-medium text-[#344054]">
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

          <label className="grid gap-1 text-sm font-medium text-[#344054]">
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

          <label className="grid gap-1 text-sm font-medium text-[#344054]">
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

          <label className="grid gap-1 text-sm font-medium text-[#344054]">
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

          <label className="grid gap-1 text-sm font-medium text-[#344054]">
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

          <label className="grid gap-1 text-sm font-medium text-[#344054]">
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

          <label className="grid gap-1 text-sm font-medium text-[#344054]">
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

          <label className="grid gap-1 text-sm font-medium text-[#344054]">
            Срок
            <select name="due" defaultValue={filters.due ?? ""} className="form-control">
              <option value="">Все</option>
              <option value="overdue">Просрочено</option>
            </select>
          </label>

          <label className="grid gap-1 text-sm font-medium text-[#344054]">
            Риск
            <select name="riskLevel" defaultValue={filters.riskLevel ?? ""} className="form-control">
              <option value="">Все</option>
              {riskLevels.map((riskLevel) => (
                <option key={riskLevel} value={riskLevel}>
                  {riskLevelLabels[riskLevel]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </details>
    </form>
  );
}
