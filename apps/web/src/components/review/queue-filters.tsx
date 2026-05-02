import Link from "next/link";
import { StatusChip } from "@/components/ui/status-chip";
import { channelLabels, csatBucketLabels, qaStatusLabels, reviewQueueStatusLabels, samplingTypeLabels } from "@/lib/labels";
import type { ReviewQueueFilters } from "@/lib/review-repository";
import { queueCsatBuckets, queueSamplingTypes, reviewQueueStatuses } from "@/lib/review-repository";

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
      filters.supportLine
  );
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
    filters.supportLine ? { label: "Линия", value: filters.supportLine } : null
  ].filter((filter): filter is { label: string; value: string } => Boolean(filter));

  return (
    <form action="/reviews" className="panel mb-5 overflow-hidden">
      <div className="grid gap-3 p-4 lg:grid-cols-[minmax(260px,1fr)_210px_auto] lg:items-end">
        <label className="grid gap-1 text-sm font-medium text-[#344054]">
          Поиск
          <input
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="Клиент, тема, тег или внешний ID"
            className="rounded border border-[#d7dce5] bg-white px-3 py-2"
          />
        </label>

        <label className="grid gap-1 text-sm font-medium text-[#344054]">
          Статус проверки
          <select name="status" defaultValue={filters.status} className="rounded border border-[#d7dce5] bg-white px-3 py-2">
            {reviewQueueStatuses.map((status) => (
              <option key={status} value={status}>
                {reviewQueueStatusLabels[status]}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap items-end gap-2 lg:justify-end">
          <button type="submit" className="min-h-[40px] rounded bg-[#116466] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b4f52]">
            Применить
          </button>
          <Link href="/reviews" className="inline-flex min-h-[40px] items-center rounded border border-[#d7dce5] px-4 py-2 text-sm font-semibold text-[#344054] hover:bg-[#eef4f4]">
            Сбросить
          </Link>
        </div>
      </div>

      {activeFilters.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-[#d7dce5] bg-[#fbfcfd] px-4 py-3">
          <span className="text-xs font-semibold uppercase text-[#667085]">Активно</span>
          {activeFilters.map((filter) => (
            <StatusChip key={`${filter.label}:${filter.value}`} tone="accent" size="xs">
              {filter.label}: {filter.value}
            </StatusChip>
          ))}
        </div>
      ) : null}

      <details className="disclosure-panel border-t border-[#d7dce5]" open={hasAdvancedFilters}>
        <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[#344054]">
          <span>{hasAdvancedFilters ? "Дополнительные фильтры применены" : "Дополнительные фильтры"}</span>
          <span className="text-xs font-semibold uppercase text-[#667085]">Канал, источник, оператор, выборка</span>
        </summary>

        <div className="grid gap-4 border-t border-[#d7dce5] bg-[#fbfcfd] p-4 md:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-sm font-medium text-[#344054]">
            Канал
            <select name="channel" defaultValue={filters.channel ?? ""} className="rounded border border-[#d7dce5] bg-white px-3 py-2">
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
            <select name="source" defaultValue={filters.source ?? ""} className="rounded border border-[#d7dce5] bg-white px-3 py-2">
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
            <select name="assignee" defaultValue={filters.assignee ?? ""} className="rounded border border-[#d7dce5] bg-white px-3 py-2">
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
            <select name="qaAssignee" defaultValue={filters.qaAssignee ?? ""} className="rounded border border-[#d7dce5] bg-white px-3 py-2">
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
            <select name="samplingType" defaultValue={filters.samplingType ?? ""} className="rounded border border-[#d7dce5] bg-white px-3 py-2">
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
            <select name="csatBucket" defaultValue={filters.csatBucket ?? ""} className="rounded border border-[#d7dce5] bg-white px-3 py-2">
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
            <select name="supportLine" defaultValue={filters.supportLine ?? ""} className="rounded border border-[#d7dce5] bg-white px-3 py-2">
              <option value="">Все</option>
              {supportLines.map((supportLine) => (
                <option key={supportLine} value={supportLine}>
                  {supportLine}
                </option>
              ))}
            </select>
          </label>
        </div>
      </details>
    </form>
  );
}
