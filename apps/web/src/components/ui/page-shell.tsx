"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { scheduleNavigationCommitFallback } from "@/lib/action-result-bridge";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/**
 * Cross-screen page header composed from shadcn primitives (Badge, Separator).
 * Layout uses semantic tokens + flex/gap only — no legacy page-shell CSS dependency.
 */
export type PageShellTab = {
  label: ReactNode;
  href: string;
  active?: boolean;
  count?: number;
  prefetch?: boolean;
};

export function PageShell({
  eyebrow,
  title,
  description,
  actions,
  tabs,
  children,
  className
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  tabs?: PageShellTab[];
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="page-shell"
      className={cn(
        "mx-auto flex min-w-0 w-full max-w-[var(--content-max-width,1420px)] flex-col gap-6 p-3 md:p-6",
        className
      )}
    >
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          {eyebrow != null ? (
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{eyebrow}</p>
          ) : null}
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {description != null ? (
            <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions != null ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </header>

      {tabs && tabs.length > 0 ? (
        <nav
          data-slot="page-shell-tabs"
          className="flex flex-nowrap items-center gap-1 overflow-x-auto border-b border-border pb-px"
          aria-label="Разделы страницы"
        >
          {tabs.map((tab, index) => (
            <Link
              key={`${tab.href}:${index}`}
              href={tab.href}
              prefetch={tab.prefetch}
              onClick={() => scheduleNavigationCommitFallback(tab.href)}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-t-md px-3 py-2 text-sm font-medium transition-[color,background-color,border-color] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)]",
                tab.active
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-current={tab.active ? "page" : undefined}
            >
              <span>{tab.label}</span>
              {tab.count != null ? (
                <Badge variant="secondary" className="h-5 min-w-5 justify-center px-1.5 text-xs">
                  {tab.count}
                </Badge>
              ) : null}
            </Link>
          ))}
        </nav>
      ) : (
        <Separator />
      )}

      {children != null ? (
        <div data-slot="page-shell-content" className="flex min-w-0 flex-col gap-6">
          {children}
        </div>
      ) : null}
    </div>
  );
}
