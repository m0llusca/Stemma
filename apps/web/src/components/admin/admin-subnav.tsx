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
import clsx from "clsx";
import { adminSectionTitles } from "@/lib/admin-sections";
import { hasPermission, type Permission } from "@/lib/auth/permissions";

/**
 * Contained admin sub-navigation (redesign v2, plan B3).
 *
 * A quiet, left-rail list of the admin sections, grouped and labeled, with the
 * active item resolved from the current path. Lives ONLY inside the admin area
 * (rendered by AdminFrame next to the page content) — it is not global chrome.
 * Token-driven (no raw hex), holds across every theme including Night Ops. All
 * styling lives in `src/app/styles/components/40-admin.css` under
 * `.admin-subnav*`.
 */
export type AdminSubnavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ size?: number | string; "aria-hidden"?: boolean }>;
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

  return (
    <nav className={clsx("admin-subnav", className)} aria-label="Разделы администрирования">
      {showOverview ? (
        <Link
          href="/admin"
          className={clsx("admin-subnav__home", pathname === "/admin" && "admin-subnav__home--active")}
          aria-current={pathname === "/admin" ? "page" : undefined}
        >
          Обзор настроек
        </Link>
      ) : null}
      {groups.map((group) => (
        <div key={group.id} className="admin-subnav__group">
          <p className="admin-subnav__group-label">{group.label}</p>
          <ul className="admin-subnav__list">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item);

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={clsx("admin-subnav__item", active && "admin-subnav__item--active")}
                    aria-current={active ? "page" : undefined}
                  >
                    <span className="admin-subnav__item-icon" aria-hidden>
                      <Icon size={15} aria-hidden />
                    </span>
                    <span className="admin-subnav__item-label">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
