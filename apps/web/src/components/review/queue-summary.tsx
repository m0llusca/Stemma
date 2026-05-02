type QueueSummaryProps = {
  total: number;
  unreviewed: number;
  reviewed: number;
  highRisk: number;
  filtered: number;
};

const summaryItems = [
  { key: "total", label: "Всего" },
  { key: "unreviewed", label: "В очереди" },
  { key: "reviewed", label: "Завершено" },
  { key: "highRisk", label: "С риском" },
  { key: "filtered", label: "Найдено" }
] as const;

export function QueueSummary({ total, unreviewed, reviewed, highRisk, filtered }: QueueSummaryProps) {
  const values = { total, unreviewed, reviewed, highRisk, filtered };

  return (
    <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {summaryItems.map((item) => (
        <div key={item.key} className="panel p-4">
          <p className="text-xs font-semibold uppercase text-[#667085]">{item.label}</p>
          <p className="mt-2 text-2xl font-semibold text-[#17202a]">{values[item.key]}</p>
        </div>
      ))}
    </section>
  );
}
