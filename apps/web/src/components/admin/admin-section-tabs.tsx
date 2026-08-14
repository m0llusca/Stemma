"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { scheduleNavigationCommitFallback } from "@/lib/action-result-bridge";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type AdminSectionTab = {
  href: string;
  label: string;
  active?: boolean;
  /** Необязательный счётчик (число ключей, событий и т.п.) рядом с подписью. */
  count?: number;
};

/**
 * Единственный admin-стандарт секционных вкладок (?section=...). Построен на
 * shadcn Tabs + Link, чтобы каждый подраздел не рисовал свою копию. Активную
 * вкладку вычисляет страница и передаёт готовый список; клик ведёт по href
 * (маршрутизация Next.js сохраняется).
 */
export function AdminSectionTabs({
  items,
  ariaLabel,
  actions,
  className
}: {
  items: AdminSectionTab[];
  ariaLabel: string;
  /**
   * Действия раздела (создание, быстрые ссылки) — рендерятся в той же строке
   * справа от вкладок, рядом с контентом, а не в дальнем углу шапки страницы.
   */
  actions?: ReactNode;
  className?: string;
}) {
  const activeValue = items.find((item) => item.active)?.href ?? items[0]?.href ?? "";

  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between",
        className
      )}
    >
      <Tabs value={activeValue} className="min-w-0">
        <TabsList
          variant="line"
          aria-label={ariaLabel}
          className="h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0 sm:w-fit"
        >
          {items.map((item) => (
            <TabsTrigger
              key={item.href}
              value={item.href}
              className="h-8 gap-2 px-3"
              render={
                <Link
                  href={item.href}
                  aria-current={item.active ? "page" : undefined}
                  onClick={() => scheduleNavigationCommitFallback(item.href)}
                />
              }
              nativeButton={false}
            >
              <span>{item.label}</span>
              {typeof item.count === "number" ? (
                <Badge variant="secondary" className="h-5 min-w-5 justify-center px-1.5 text-xs">
                  {item.count}
                </Badge>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
