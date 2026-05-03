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
  { key: "inWork", label: "В работе" },
  { key: "reviewed", label: "Завершено" },
  { key: "overdue", label: "Просрочено" }
] as const;

export function QueueSummary({ total, queued, inWork, drafts, reviewed, overdue, filtered }: QueueSummaryProps) {
  const values = { total, queued, inWork, drafts, reviewed, overdue, filtered };

  return (
    <section className="metric-strip" aria-label="Сводка очереди проверок">
      <div className="metric-strip__item">
        <p className="metric-strip__label">Найдено</p>
        <p className="metric-strip__value">{filtered}</p>
      </div>
      {summaryItems.map((item) => (
        <div key={item.key} className="metric-strip__item">
          <p className="metric-strip__label">{item.label}</p>
          <p className="metric-strip__value">{values[item.key]}</p>
        </div>
      ))}
    </section>
  );
}
