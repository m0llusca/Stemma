type QueueSummaryProps = {
  total: number;
  queued: number;
  inWork: number;
  drafts: number;
  reviewed: number;
  overdue: number;
  filtered: number;
};

const summaryItems = [
  { key: "queued", label: "В очереди" },
  { key: "inWork", label: "В работе" },
  { key: "drafts", label: "Черновики" },
  { key: "reviewed", label: "Завершено" },
  { key: "overdue", label: "Просрочено" },
  { key: "total", label: "Всего" }
] as const;

export function QueueSummary({ total, queued, inWork, drafts, reviewed, overdue, filtered }: QueueSummaryProps) {
  const values = { total, queued, inWork, drafts, reviewed, overdue, filtered };

  return (
    <section className="panel mb-4 overflow-hidden">
      <div className="grid lg:grid-cols-[190px_minmax(0,1fr)]">
        <div className="border-b border-[#d7dce5] bg-[#fbfcfd] p-4 lg:border-b-0 lg:border-r">
          <p className="text-xs font-semibold uppercase text-[#667085]">Найдено</p>
          <p className="mt-1 text-3xl font-semibold text-[#17202a]">{filtered}</p>
        </div>
        <dl className="grid grid-cols-2 divide-x divide-y divide-[#d7dce5] text-sm sm:grid-cols-3 xl:grid-cols-6 xl:divide-y-0">
          {summaryItems.map((item) => (
            <div key={item.key} className="min-h-[74px] p-4">
              <dt className="text-xs font-semibold uppercase text-[#667085]">{item.label}</dt>
              <dd className="mt-1 text-xl font-semibold text-[#17202a]">{values[item.key]}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
