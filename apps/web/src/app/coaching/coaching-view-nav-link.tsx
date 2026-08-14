"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { scheduleNavigationCommitFallback } from "@/lib/action-result-bridge";

/**
 * Вкладка видов разборов (?view=...). Клиентская обёртка над Link нужна, чтобы
 * вооружить fallback коммита навигации — Next 16.2.x иногда принимает RSC-ответ,
 * но не применяет переход (см. action-result-bridge.ts); page-shell и
 * admin-section-tabs вооружают тот же fallback inline.
 */
export function CoachingViewNavLink({
  href,
  active,
  className,
  children
}: {
  href: string;
  active: boolean;
  className: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={() => scheduleNavigationCommitFallback(href)}
      className={className}
    >
      {children}
    </Link>
  );
}
