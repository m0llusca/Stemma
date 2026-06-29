"use client";

import type { ComponentType } from "react";
import {
  Activity,
  Gauge,
  History,
  KeyRound,
  Languages,
  ListChecks,
  Palette,
  Plug,
  ShieldCheck,
  UsersRound
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

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
type AdminSubnavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ size?: number | string; "aria-hidden"?: boolean }>;
  /** Extra path prefixes that should also mark this item active. */
  match?: string[];
};

type AdminSubnavGroup = {
  id: string;
  label: string;
  items: AdminSubnavItem[];
};

const groups: AdminSubnavGroup[] = [
  {
    id: "methodology",
    label: "Методология",
    items: [
      { href: "/admin/scorecards", label: "Формы оценки", icon: Gauge },
      { href: "/admin/sampling", label: "Выборки", icon: ListChecks }
    ]
  },
  {
    id: "connections",
    label: "Подключения",
    items: [
      { href: "/admin/integrations", label: "Интеграции", icon: Plug },
      { href: "/admin/users", label: "Пользователи", icon: UsersRound },
      { href: "/admin/access", label: "Доступ и SSO", icon: ShieldCheck },
      { href: "/admin/tokens", label: "API-доступ", icon: KeyRound },
      { href: "/admin/system", label: "Система", icon: Activity }
    ]
  },
  {
    id: "control",
    label: "Контроль",
    items: [
      { href: "/admin/appearance", label: "Внешний вид", icon: Palette },
      { href: "/admin/localization", label: "Локализация", icon: Languages },
      { href: "/admin/audit", label: "Журнал действий", icon: History }
    ]
  }
];

function isActive(pathname: string, item: AdminSubnavItem) {
  const candidates = [item.href, ...(item.match ?? [])];
  return candidates.some(
    (candidate) => pathname === candidate || pathname.startsWith(`${candidate}/`)
  );
}

export function AdminSubnav({ className }: { className?: string }) {
  const pathname = usePathname() ?? "/admin";

  return (
    <nav className={clsx("admin-subnav", className)} aria-label="Разделы администрирования">
      <Link
        href="/admin"
        className={clsx("admin-subnav__home", pathname === "/admin" && "admin-subnav__home--active")}
        aria-current={pathname === "/admin" ? "page" : undefined}
      >
        Обзор настроек
      </Link>
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
