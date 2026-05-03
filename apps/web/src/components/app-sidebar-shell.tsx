"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookOpenCheck, ChevronsLeft, ChevronsRight, ClipboardCheck, Scale, Settings, UserCheck } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

type SidebarIcon = "reviews" | "self-review" | "calibration" | "coaching" | "reports" | "admin";

export type SidebarNavItem = {
  href: string;
  label: string;
  icon: SidebarIcon;
  badge?: number;
};

const icons = {
  reviews: ClipboardCheck,
  "self-review": UserCheck,
  calibration: Scale,
  coaching: BookOpenCheck,
  reports: BarChart3,
  admin: Settings
} satisfies Record<SidebarIcon, typeof ClipboardCheck>;

function isActivePath(pathname: string, href: string) {
  if (href === "/admin") {
    return pathname === href || pathname.startsWith("/admin/");
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebarShell({
  items,
  children
}: {
  items: SidebarNavItem[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem("qc-sidebar-collapsed") === "1");
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      localStorage.setItem("qc-sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  }

  return (
    <aside className={`app-sidebar ${collapsed ? "app-sidebar--collapsed" : ""} px-4 py-5`}>
      <div className="app-sidebar__header mb-8">
        <div className="app-sidebar__brand">
          <span className="app-sidebar__logo">КК</span>
          <div className="app-sidebar__brand-copy min-w-0">
            <div className="truncate text-lg font-semibold text-white">КК поддержки</div>
            <div className="truncate text-sm text-slate-400">Ручная проверка</div>
          </div>
        </div>
      </div>
      <nav className="app-sidebar__nav grid gap-1" aria-label="Основное меню">
        {items.map((item) => {
          const Icon = icons[item.icon];
          const isActive = isActivePath(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              aria-current={isActive ? "page" : undefined}
              className={`app-sidebar__nav-link group flex min-h-[42px] items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${
                isActive ? "app-sidebar__nav-link--active" : ""
              }`}
            >
              <span className="app-sidebar__nav-icon">
                <Icon size={16} aria-hidden="true" />
              </span>
              <span className="app-sidebar__nav-label truncate">{item.label}</span>
              {item.badge ? (
                <span className="app-sidebar__badge" aria-label={`Открытые апелляции: ${item.badge}`}>
                  {item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="app-sidebar__role">{children}</div>
      <button
        type="button"
        className="app-sidebar__collapse-button"
        onClick={toggleCollapsed}
        aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
        title={collapsed ? "Развернуть меню" : "Свернуть меню"}
      >
        {collapsed ? <ChevronsRight size={16} aria-hidden="true" /> : <ChevronsLeft size={16} aria-hidden="true" />}
        <span className="app-sidebar__collapse-label">{collapsed ? "Развернуть" : "Свернуть"}</span>
      </button>
    </aside>
  );
}
