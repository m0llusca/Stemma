import Link from "next/link";
import type { ReactNode } from "react";

export type AdminSectionTab = {
  href: string;
  label: string;
  active?: boolean;
  /** Необязательный счётчик (число ключей, событий и т.п.) рядом с подписью. */
  count?: number;
};

/**
 * Единственный admin-стандарт секционных вкладок (?section=...). Повторяет
 * прежнюю ручную разметку ops-tabs, чтобы каждый подраздел не рисовал свою
 * копию с расхождениями. Серверный компонент: активную вкладку вычисляет
 * страница и передаёт готовый список.
 */
export function AdminSectionTabs({
  items,
  ariaLabel,
  actions
}: {
  items: AdminSectionTab[];
  ariaLabel: string;
  /**
   * Действия раздела (создание, быстрые ссылки) — рендерятся в той же строке
   * справа от вкладок, рядом с контентом, а не в дальнем углу шапки страницы.
   */
  actions?: ReactNode;
}) {
  return (
    <nav className="ops-tabs ops-tabs--section" aria-label={ariaLabel}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`ops-tab ${item.active ? "ops-tab--active" : ""}`}
          aria-current={item.active ? "page" : undefined}
        >
          {item.label}
          {typeof item.count === "number" ? <span className="ops-tab__count">{item.count}</span> : null}
        </Link>
      ))}
      {actions ? <div className="ops-tabs__actions">{actions}</div> : null}
    </nav>
  );
}
