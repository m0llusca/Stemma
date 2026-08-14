"use client";

import type { ComponentType } from "react";
import {
  Activity,
  CalendarClock,
  Gauge,
  History,
  KeyRound,
  Languages,
  ListChecks,
  Palette,
  Plug,
  Send,
  ShieldCheck,
  Sparkles,
  UsersRound
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { RoleName } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { adminSectionTitles } from "@/lib/admin-sections";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

/**
 * Contained admin sub-navigation (redesign v2, plan B3).
 *
 * A quiet, left-rail list of the admin sections, grouped and labeled, with the
 * active item resolved from the current path. Lives ONLY inside the admin area
 * (rendered by AdminFrame next to the page content) — it is not global chrome.
 * Built from shadcn Button + Link; holds across every theme including Night Ops.
 */
export type AdminSubnavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ size?: number | string; "aria-hidden"?: boolean; className?: string }>;
  /** Extra path prefixes that should also mark this item active. */
  match?: string[];
  /**
   * Permission that guards the item's target page (the one its `page.tsx`
   * enforces via `requireCurrentUserPermission`). Items without a declared
   * permission are always visible.
   */
  permission?: Permission;
};

export type AdminSubnavGroup = {
  id: string;
  label: string;
  items: AdminSubnavItem[];
};

/** Permission guarding the `/admin` overview link (its page requires `audit:read`). */
export const adminOverviewPermission: Permission = "audit:read";

/**
 * Группы сбалансированы по смыслу (3/3/3/4), а метка честно описывает
 * содержимое: люди и доступ отдельно от потоков данных, платформа — отдельно.
 * Подписи пунктов берутся ТОЛЬКО из канонического словаря adminSectionTitles.
 */
export const adminSubnavGroups: AdminSubnavGroup[] = [
  {
    id: "methodology",
    label: "Методология",
    items: [
      { href: "/admin/scorecards", label: adminSectionTitles["/admin/scorecards"], icon: Gauge, permission: "scorecards:manage" },
      { href: "/admin/sampling", label: adminSectionTitles["/admin/sampling"], icon: ListChecks, permission: "sampling:manage" },
      { href: "/admin/ai-scoring", label: adminSectionTitles["/admin/ai-scoring"], icon: Sparkles, permission: "backend_jobs:manage" }
    ]
  },
  {
    id: "identity",
    label: "Люди и доступ",
    items: [
      { href: "/admin/users", label: adminSectionTitles["/admin/users"], icon: UsersRound, permission: "users:manage" },
      { href: "/admin/access", label: adminSectionTitles["/admin/access"], icon: ShieldCheck, permission: "auth_providers:manage" },
      { href: "/admin/tokens", label: adminSectionTitles["/admin/tokens"], icon: KeyRound, permission: "api_tokens:manage" }
    ]
  },
  {
    id: "data-flows",
    label: "Данные и каналы",
    items: [
      { href: "/admin/integrations", label: adminSectionTitles["/admin/integrations"], icon: Plug, permission: "integrations:manage" },
      { href: "/admin/channels", label: adminSectionTitles["/admin/channels"], icon: Send, permission: "backend_jobs:manage" },
      { href: "/admin/report-schedules", label: adminSectionTitles["/admin/report-schedules"], icon: CalendarClock, permission: "reports:read" }
    ]
  },
  {
    id: "platform",
    label: "Платформа",
    items: [
      { href: "/admin/system", label: adminSectionTitles["/admin/system"], icon: Activity, permission: "backend_jobs:manage" },
      { href: "/admin/appearance", label: adminSectionTitles["/admin/appearance"], icon: Palette, permission: "appearance:manage" },
      { href: "/admin/localization", label: adminSectionTitles["/admin/localization"], icon: Languages, permission: "appearance:manage" },
      { href: "/admin/audit", label: adminSectionTitles["/admin/audit"], icon: History, permission: "audit:read" }
    ]
  }
];

/**
 * Keep only the sections the given role can actually open. An item survives
 * when it declares no permission, or when the role holds that permission.
 * Groups left without a single visible item are dropped entirely so the rail
 * never renders an empty heading. Pure and side-effect free — unit-testable.
 */
export function filterAdminSubnavGroups(
  groups: AdminSubnavGroup[],
  role: RoleName
): AdminSubnavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => item.permission === undefined || hasPermission(role, item.permission)
      )
    }))
    .filter((group) => group.items.length > 0);
}

function isActive(pathname: string, item: AdminSubnavItem) {
  const candidates = [item.href, ...(item.match ?? [])];
  return candidates.some(
    (candidate) => pathname === candidate || pathname.startsWith(`${candidate}/`)
  );
}

export function AdminSubnav({
  className,
  role
}: {
  className?: string;
  /**
   * Current user's role. The rail filters its own sections client-side from
   * this — the filtering must NOT run in the server-side AdminFrame, since
   * `filterAdminSubnavGroups` lives in this "use client" module and a server
   * component cannot call a client function directly.
   */
  role: RoleName;
}) {
  const pathname = usePathname() ?? "/admin";
  const groups = filterAdminSubnavGroups(adminSubnavGroups, role);
  const showOverview = hasPermission(role, adminOverviewPermission);
  const overviewActive = pathname === "/admin";

  return (
    <nav
      className={cn(
        "flex min-w-0 flex-col gap-4 max-lg:gap-2.5 max-lg:rounded-xl max-lg:border max-lg:border-border max-lg:bg-muted/40 max-lg:p-1",
        className
      )}
      aria-label="Разделы администрирования"
    >
      {showOverview ? (
        <Button
          variant={overviewActive ? "secondary" : "ghost"}
          size="sm"
          className={cn(
            "h-auto w-full justify-start px-2.5 py-1.5 text-left font-medium",
            overviewActive ? "text-foreground" : "text-muted-foreground"
          )}
          render={<Link href="/admin" aria-current={overviewActive ? "page" : undefined} />}
          nativeButton={false}
        >
          Обзор настроек
        </Button>
      ) : null}
      {groups.map((group) => (
        <div key={group.id} className="flex min-w-0 flex-col gap-1">
          <p className="px-2.5 text-[10.5px] font-semibold tracking-[0.07em] text-muted-foreground uppercase">
            {group.label}
          </p>
          <ul className="flex min-w-0 flex-col gap-px max-lg:flex-row max-lg:overflow-x-auto max-lg:pb-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item);

              return (
                <li key={item.href} className="min-w-0 max-lg:shrink-0">
                  <Button
                    variant={active ? "secondary" : "ghost"}
                    size="sm"
                    className={cn(
                      "h-auto w-full justify-start gap-2.5 px-2.5 py-1.5 text-left font-normal",
                      active ? "font-medium text-foreground" : "text-muted-foreground"
                    )}
                    render={
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                      />
                    }
                    nativeButton={false}
                  >
                    <Icon className="size-3.5 shrink-0 max-lg:hidden" aria-hidden />
                    <span className="min-w-0 truncate">{item.label}</span>
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
