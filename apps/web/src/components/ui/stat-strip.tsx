export type StatStripTone = "neutral" | "accent" | "success" | "warning" | "danger";

export type StatStripItem = {
  label: string;
  value: string | number;
  tone?: StatStripTone;
  /** Короткое пояснение после значения (например «за все время»). */
  hint?: string;
};

/**
 * Компактная строка метрик: «значение подпись · значение подпись …».
 * Замена громоздким сеткам карточек там, где числа маленькие и их 3–5:
 * строка читается одним взглядом и не съедает первый экран раздела.
 */
export function StatStrip({ items, ariaLabel }: { items: StatStripItem[]; ariaLabel: string }) {
  return (
    <dl className="stat-strip" aria-label={ariaLabel}>
      {items.map((item) => (
        <div key={item.label} className="stat-strip__item">
          <dd className={`stat-strip__value stat-strip__value--${item.tone ?? "neutral"}`}>{item.value}</dd>
          <dt className="stat-strip__label">
            {item.label}
            {item.hint ? <span className="stat-strip__hint"> · {item.hint}</span> : null}
          </dt>
        </div>
      ))}
    </dl>
  );
}
