"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowRight,
  Bell,
  ChevronDown,
  ClipboardCheck,
  Command,
  GraduationCap,
  Scale,
  Search,
  TrendingUp,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  activeAreaForPath,
  topNavAreas,
  type ShellCommandItem,
  type ShellNavAreaIcon,
  type ShellNavigation
} from "@/lib/shell/navigation";
import { resolveWorkspaceBranding, type WorkspaceBranding } from "@/lib/ui-theme";
import { switchCurrentUser } from "@/lib/user-actions";

type WorkPulseItem = {
  href: string;
  label: string;
  value: number;
  tone?: "neutral" | "risk" | "warning";
};

type AppNavShellProps = {
  navigation: ShellNavigation;
  pulseItems: WorkPulseItem[];
  user: {
    name: string;
    email: string;
  };
  demoSwitcher?: {
    currentUserId: string;
    roleLabel: string;
    users: Array<{
      id: string;
      name: string;
    }>;
  } | null;
  branding?: WorkspaceBranding;
};

const areaIcons = {
  today: Activity,
  review: ClipboardCheck,
  calibration: Scale,
  coaching: GraduationCap,
  analytics: TrendingUp
} satisfies Record<ShellNavAreaIcon, typeof ClipboardCheck>;

const defaultNavBranding = resolveWorkspaceBranding({});

function commandMatches(command: ShellCommandItem, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return [command.label, command.description, command.modeLabel, ...command.aliases].some((value) =>
    value.toLowerCase().includes(normalized)
  );
}

export function AppNavShell({ navigation, pulseItems, user, demoSwitcher, branding = defaultNavBranding }: AppNavShellProps) {
  const pathname = usePathname();
  const [commandOpen, setCommandOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeBranding, setActiveBranding] = useState<WorkspaceBranding>(branding);
  const activeAreaId = useMemo(() => activeAreaForPath(pathname), [pathname]);
  const visibleCommands = useMemo(
    () => navigation.commandItems.filter((command) => commandMatches(command, query)).slice(0, 9),
    [navigation.commandItems, query]
  );
  const demoUserName = demoSwitcher?.users.find((workspaceUser) => workspaceUser.id === demoSwitcher.currentUserId)?.name ?? user.name;

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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }

      if (event.key === "Escape") {
        setCommandOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <header className="app-nav" aria-label="Глобальная навигация">
      <div className="app-nav__inner">
        <Link href="/dashboard" className="app-nav__brand" aria-label={activeBranding.brandLogoAlt}>
          <span className={`app-nav__logo ${activeBranding.brandLogoUrl ? "app-nav__logo--image" : ""}`}>
            {activeBranding.brandLogoUrl ? (
              <img src={activeBranding.brandLogoUrl} alt={activeBranding.brandLogoAlt} />
            ) : (
              activeBranding.brandMark
            )}
          </span>
        </Link>

        <nav className="app-nav__areas" aria-label="Основные разделы">
          {topNavAreas.map((area) => {
            const Icon = areaIcons[area.icon];
            const isActive = area.id === activeAreaId;

            return (
              <Link
                key={area.id}
                href={area.href}
                title={area.description}
                aria-current={isActive ? "page" : undefined}
                className={`app-nav__area ${isActive ? "app-nav__area--active" : ""}`}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{area.label}</span>
              </Link>
            );
          })}
        </nav>

        <button type="button" className="app-command-trigger app-nav__command" onClick={() => setCommandOpen(true)}>
          <Search size={15} aria-hidden="true" />
          <span>Поиск или команда</span>
          <kbd>⌘K</kbd>
        </button>

        <div className="app-nav__work-tray" aria-label="Рабочий пульс">
          <div className="work-pulse">
            {pulseItems.map((item) => (
              <Link key={item.label} href={item.href} className={`work-pulse__item ${item.tone ? `work-pulse__item--${item.tone}` : ""}`}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </Link>
            ))}
          </div>
          <Link href="/reviews?status=unreviewed" className="app-nav__primary" aria-label="Взять следующий кейс">
            <span className="app-nav__primary-label">Взять кейс</span>
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>

        {demoSwitcher ? (
          <div className="app-nav__identity-slot">
            <details className="app-nav__identity-menu">
              <summary className="app-nav__identity-summary">
                <span className="app-nav__identity-copy">
                  <strong>{demoSwitcher.roleLabel}</strong>
                  <small>{demoUserName}</small>
                </span>
                <ChevronDown size={14} aria-hidden="true" />
              </summary>
              <div className="app-nav__identity-popover">
                <form action={switchCurrentUser} className="app-nav__identity-form">
                  <label>
                    <span>Демо-роль</span>
                    <select name="userId" defaultValue={demoSwitcher.currentUserId} aria-label="Демо-пользователь">
                      {demoSwitcher.users.map((workspaceUser) => (
                        <option key={workspaceUser.id} value={workspaceUser.id}>
                          {workspaceUser.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="submit">Сменить</button>
                  <small>{demoSwitcher.roleLabel}</small>
                </form>
                <form action="/auth/logout" method="post" className="app-nav__logout-form">
                  <button type="submit">Выйти</button>
                </form>
              </div>
            </details>
          </div>
        ) : (
          <div className="app-nav__identity-slot">
            <details className="app-nav__identity-menu">
              <summary className="app-nav__identity-summary" title={user.email}>
                <span className="app-nav__identity-copy">
                  <strong>{user.name}</strong>
                  <small>{user.email}</small>
                </span>
                <ChevronDown size={14} aria-hidden="true" />
              </summary>
              <div className="app-nav__identity-popover">
                <span className="app-nav__identity-user" title={user.email}>
                  <Bell size={14} aria-hidden="true" />
                  {user.name}
                </span>
                <form action="/auth/logout" method="post" className="app-nav__logout-form">
                  <button type="submit">Выйти</button>
                </form>
              </div>
            </details>
          </div>
        )}
      </div>

      {commandOpen ? (
        <div className="command-palette" role="dialog" aria-modal="true" aria-label="Поиск и команды">
          <div className="command-palette__panel">
            <div className="command-palette__search">
              <Command size={16} aria-hidden="true" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Найти раздел, очередь, интеграцию или действие"
              />
              <button type="button" onClick={() => setCommandOpen(false)} aria-label="Закрыть поиск">
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="command-palette__list">
              {visibleCommands.length > 0 ? (
                visibleCommands.map((command) => (
                  <Link key={`${command.kind}:${command.href}:${command.label}`} href={command.href} onClick={() => setCommandOpen(false)}>
                    <span>
                      <strong>{command.label}</strong>
                      <small>{command.description}</small>
                    </span>
                    <span className="command-palette__meta">
                      {command.kind === "action" ? <em className="command-palette__kind">Действие</em> : null}
                      <em>{command.modeLabel}</em>
                    </span>
                  </Link>
                ))
              ) : (
                <div className="command-palette__empty">Ничего не найдено. Попробуйте “очередь”, “интеграции” или “обучение”.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
