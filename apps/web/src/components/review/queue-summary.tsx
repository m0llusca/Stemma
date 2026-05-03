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
  { key: "queued", label: "Ожидают" },
  { key: "inWork", label: "В работе" },
  { key: "drafts", label: "Черновики" },
  { key: "reviewed", label: "Завершено" },
  { key: "overdue", label: "Просрочено" }
] as const;

export function QueueSummary({ total, queued, inWork, drafts, reviewed, overdue, filtered }: QueueSummaryProps) {
  const values = { total, queued, inWork, drafts, reviewed, overdue, filtered };

  return (
    <section className="focus-summary" aria-label="Сводка очереди проверок">
      <div className="focus-summary__lead">
        <p className="focus-summary__label">Найдено</p>
        <p className="focus-summary__value">{filtered}</p>
        <p className="focus-summary__hint">Всего в очереди: {total}. Сначала разберите просрочки и обращения с риском.</p>
      </div>
      <div className="focus-summary__metrics">
        {summaryItems.map((item) => (
          <div key={item.key} className="focus-summary__metric">
            <p className="metric-strip__label">{item.label}</p>
            <p className="metric-strip__value">{values[item.key]}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
