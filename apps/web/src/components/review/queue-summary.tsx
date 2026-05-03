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
    <section className="queue-summary-compact" aria-label="Сводка очереди проверок">
      <div className="queue-summary-compact__lead">
        <span>Найдено</span>
        <strong>{filtered}</strong>
        <small>всего {total}</small>
      </div>
      <div className="queue-summary-compact__metrics">
        {summaryItems.map((item) => (
          <div key={item.key} className="queue-summary-compact__metric">
            <span>{item.label}</span>
            <strong>{values[item.key]}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
