import Link from "next/link";
import { channelLabels, reviewQueueStatusLabels } from "@/lib/labels";
import type { ReviewQueueFilters } from "@/lib/review-repository";
import { reviewQueueStatuses } from "@/lib/review-repository";

type QueueFiltersProps = {
  filters: ReviewQueueFilters;
  sources: string[];
  assignees: string[];
};

export function QueueFilters({ filters, sources, assignees }: QueueFiltersProps) {
  return (
    <form action="/reviews" className="panel mb-5 grid gap-4 p-4 xl:grid-cols-[minmax(220px,1fr)_160px_160px_180px_180px_auto]">
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
        Ответственный
        <select name="assignee" defaultValue={filters.assignee ?? ""} className="rounded border border-[#d7dce5] bg-white px-3 py-2">
          <option value="">Все</option>
          {assignees.map((assignee) => (
            <option key={assignee} value={assignee}>
              {assignee}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-end gap-2">
        <button type="submit" className="rounded bg-[#116466] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b4f52]">
          Применить
        </button>
        <Link href="/reviews" className="rounded border border-[#d7dce5] px-4 py-2 text-sm font-semibold text-[#344054] hover:bg-[#eef4f4]">
          Сбросить
        </Link>
      </div>
    </form>
  );
}
