"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ClipboardCheck,
  LogOut,
  SlidersHorizontal,
  Settings,
  UsersRound
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ShellNavigation, ShellNavIcon } from "@/lib/shell/navigation";
import { resolveWorkspaceBranding, type WorkspaceBranding } from "@/lib/ui-theme";

const icons = {
  today: Activity,
  work: ClipboardCheck,
  quality: SlidersHorizontal,
  team: UsersRound,
  system: Settings
} satisfies Record<ShellNavIcon, typeof ClipboardCheck>;
const defaultSidebarBranding = resolveWorkspaceBranding({});

function isActivePath(pathname: string, href: string) {
  const path = href.split("?")[0] || href;
  return pathname === path || pathname.startsWith(`${path}/`);
}

function activeModeIdForPath(pathname: string, navigation: ShellNavigation) {
  return navigation.modes
    .map((mode) => ({
      id: mode.id,
      matchLength: Math.max(
        isActivePath(pathname, mode.href) ? mode.href.length : 0,
        ...mode.destinations.map((destination) => (isActivePath(pathname, destination.href) ? destination.href.length : 0))
      )
    }))
    .filter((item) => item.matchLength > 0)
    .sort((first, second) => second.matchLength - first.matchLength)[0]?.id;
}

export function AppSidebarShell({
  navigation,
  branding = defaultSidebarBranding
}: {
  navigation: ShellNavigation;
  branding?: WorkspaceBranding;
}) {
  const pathname = usePathname();
  const [activeBranding, setActiveBranding] = useState<WorkspaceBranding>(branding);
  const activeModeId = useMemo(() => activeModeIdForPath(pathname, navigation), [navigation, pathname]);

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

  return (
    <aside className="app-sidebar app-rail" aria-label="Режимы системы">
      <div className="app-sidebar__header">
        <div className="app-sidebar__brand">
          <span className={`app-sidebar__logo ${activeBranding.brandLogoUrl ? "app-sidebar__logo--image" : ""}`}>
            {activeBranding.brandLogoUrl ? <img src={activeBranding.brandLogoUrl} alt={activeBranding.brandLogoAlt} /> : activeBranding.brandMark}
          </span>
        </div>
      </div>
      <nav className="app-sidebar__nav" aria-label="Основное меню">
        {navigation.modes.map((mode) => {
          const Icon = icons[mode.icon];
          const isActive = mode.id === activeModeId;

          return (
            <Link
              key={mode.id}
              href={mode.href}
              title={mode.description}
              aria-current={isActive ? "page" : undefined}
              className={`app-sidebar__nav-link ${isActive ? "app-sidebar__nav-link--active" : ""}`}
            >
              <span className="app-sidebar__nav-icon">
                <Icon size={18} aria-hidden="true" />
              </span>
              <span className="app-sidebar__nav-label">{mode.compactLabel}</span>
            </Link>
          );
        })}
      </nav>
      <div className="app-sidebar__footer">
        <form action="/auth/logout" method="post" className="app-sidebar__logout-form">
          <button type="submit" className="app-sidebar__footer-action" title="Выйти">
            <LogOut size={16} aria-hidden="true" />
            <span className="app-sidebar__footer-label">Выйти</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
