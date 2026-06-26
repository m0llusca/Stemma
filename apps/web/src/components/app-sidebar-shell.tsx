"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpenCheck,
  ChevronsLeft,
  ChevronsRight,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  Scale,
  Settings,
  UserCheck
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { resolveWorkspaceBranding, type WorkspaceBranding } from "@/lib/ui-theme";

type SidebarIcon = "dashboard" | "reviews" | "self-review" | "calibration" | "coaching" | "reports" | "admin";
type SidebarGroup = "workspace" | "data" | "admin";

export type SidebarNavItem = {
  href: string;
  label: string;
  icon: SidebarIcon;
  group?: SidebarGroup;
  badge?: number;
};

const icons = {
  dashboard: LayoutDashboard,
  reviews: ClipboardCheck,
  "self-review": UserCheck,
  calibration: Scale,
  coaching: BookOpenCheck,
  reports: BarChart3,
  admin: Settings
} satisfies Record<SidebarIcon, typeof ClipboardCheck>;
const defaultSidebarBranding = resolveWorkspaceBranding({});
const groupLabels = {
  workspace: "Рабочее пространство",
  data: "Данные",
  admin: "Администрирование"
} satisfies Record<SidebarGroup, string>;

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function activeHrefForPath(pathname: string, items: SidebarNavItem[]) {
  return items
    .filter((item) => isActivePath(pathname, item.href))
    .sort((first, second) => second.href.length - first.href.length)[0]?.href;
}

export function AppSidebarShell({
  items,
  branding = defaultSidebarBranding,
  children
}: {
  items: SidebarNavItem[];
  branding?: WorkspaceBranding;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [activeBranding, setActiveBranding] = useState<WorkspaceBranding>(branding);
  const activeHref = useMemo(() => activeHrefForPath(pathname, items), [items, pathname]);
  const groupedItems = (["workspace", "data", "admin"] as const)
    .map((group) => ({
      group,
      items: items.filter((item) => (item.group ?? "workspace") === group)
    }))
    .filter((group) => group.items.length > 0);

  useEffect(() => {
    setCollapsed(localStorage.getItem("qc-sidebar-collapsed") === "1");
  }, []);

  useEffect(() => {
    setActiveBranding(branding);
  }, [branding]);

  useEffect(() => {
    const handleBrandingPreview = (event: Event) => {
      setActiveBranding((event as CustomEvent<WorkspaceBranding>).detail);
    };

    window.addEventListener("qc-branding-preview", handleBrandingPreview);
    return () => window.removeEventListener("qc-branding-preview", handleBrandingPreview);
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
          <span className={`app-sidebar__logo ${activeBranding.brandLogoUrl ? "app-sidebar__logo--image" : ""}`}>
            {activeBranding.brandLogoUrl ? <img src={activeBranding.brandLogoUrl} alt={activeBranding.brandLogoAlt} /> : activeBranding.brandMark}
          </span>
          <div className="app-sidebar__brand-copy min-w-0">
            <div className="truncate text-lg font-semibold text-white">{activeBranding.brandName}</div>
            <div className="truncate text-sm text-slate-400">{activeBranding.brandTagline}</div>
          </div>
        </div>
      </div>
      <nav className="app-sidebar__nav" aria-label="Основное меню">
        {groupedItems.map(({ group, items: groupItems }) => (
          <div key={group} className="app-sidebar__nav-group">
            <div className="app-sidebar__nav-group-label">{groupLabels[group]}</div>
            <div className="app-sidebar__nav-group-list">
              {groupItems.map((item) => {
                const Icon = icons[item.icon];
                const isActive = item.href === activeHref;

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
                      <span className="app-sidebar__badge" aria-label={`${item.label}: ${item.badge}`}>
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="app-sidebar__footer">
        <div className="app-sidebar__role">{children}</div>
        <form action="/auth/logout" method="post" className="app-sidebar__logout-form">
          <button type="submit" className="app-sidebar__footer-action" title={collapsed ? "Выйти" : undefined}>
            <LogOut size={16} aria-hidden="true" />
            <span className="app-sidebar__footer-label">Выйти</span>
          </button>
        </form>
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
      </div>
    </aside>
  );
}
