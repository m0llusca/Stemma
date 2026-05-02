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
  { key: "total", label: "Всего" },
  { key: "queued", label: "В очереди" },
  { key: "inWork", label: "В работе" },
  { key: "drafts", label: "Черновики" },
  { key: "reviewed", label: "Завершено" },
  { key: "overdue", label: "Просрочено" },
  { key: "filtered", label: "Найдено" }
] as const;

export function QueueSummary({ total, queued, inWork, drafts, reviewed, overdue, filtered }: QueueSummaryProps) {
  const values = { total, queued, inWork, drafts, reviewed, overdue, filtered };

  return (
    <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
      {summaryItems.map((item) => (
        <div key={item.key} className="panel p-4">
          <p className="text-xs font-semibold uppercase text-[#667085]">{item.label}</p>
          <p className="mt-2 text-2xl font-semibold text-[#17202a]">{values[item.key]}</p>
        </div>
      ))}
    </section>
  );
}
