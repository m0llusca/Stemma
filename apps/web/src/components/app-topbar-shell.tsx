"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Bell, Command, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ShellCommandItem, ShellNavigation, ShellNavMode } from "@/lib/shell/navigation";
import { switchCurrentUser } from "@/lib/user-actions";

type WorkPulseItem = {
  href: string;
  label: string;
  value: number;
  tone?: "neutral" | "risk" | "warning";
};

type AppTopbarShellProps = {
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
};

function pathOnly(href: string) {
  return href.split("?")[0] || href;
}

function isActivePath(pathname: string, href: string) {
  const target = pathOnly(href);
  return pathname === target || pathname.startsWith(`${target}/`);
}

function activeModeForPath(pathname: string, modes: ShellNavMode[]) {
  const ranked = modes
    .map((mode) => ({
      mode,
      matchLength: Math.max(
        isActivePath(pathname, mode.href) ? pathOnly(mode.href).length : 0,
        ...mode.destinations.map((destination) => (isActivePath(pathname, destination.href) ? pathOnly(destination.href).length : 0))
      )
    }))
    .filter((item) => item.matchLength > 0)
    .sort((first, second) => second.matchLength - first.matchLength);

  return ranked[0]?.mode ?? modes[0];
}

function commandMatches(command: ShellCommandItem, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return [command.label, command.description, command.modeLabel, ...command.aliases].some((value) => value.toLowerCase().includes(normalized));
}

export function AppTopbarShell({ navigation, pulseItems, user, demoSwitcher }: AppTopbarShellProps) {
  const pathname = usePathname();
  const [commandOpen, setCommandOpen] = useState(false);
  const [query, setQuery] = useState("");
  const activeMode = activeModeForPath(pathname, navigation.modes);
  const visibleCommands = useMemo(
    () => navigation.commandItems.filter((command) => commandMatches(command, query)).slice(0, 9),
    [navigation.commandItems, query]
  );

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
    <header className="app-topbar" aria-label="Глобальная панель">
      <div className="app-topbar__inner">
        <div className="app-topbar__context min-w-0">
          <p>{activeMode.label}</p>
          <nav className="app-topbar__section-nav" aria-label={`Разделы: ${activeMode.label}`}>
            {activeMode.destinations.map((destination) => {
              const isActive = isActivePath(pathname, destination.href);

              return (
                <Link key={destination.href} href={destination.href} aria-current={isActive ? "page" : undefined}>
                  {destination.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <button type="button" className="app-command-trigger" onClick={() => setCommandOpen(true)}>
          <Search size={15} aria-hidden="true" />
          <span>Поиск или команда</span>
          <kbd>⌘K</kbd>
        </button>

        <div className="work-pulse" aria-label="Рабочий пульс">
          {pulseItems.map((item) => (
            <Link key={item.label} href={item.href} className={`work-pulse__item ${item.tone ? `work-pulse__item--${item.tone}` : ""}`}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </Link>
          ))}
        </div>

        <Link href="/reviews?status=unreviewed" className="app-topbar__primary">
          Следующая проверка
          <ArrowRight size={14} aria-hidden="true" />
        </Link>

        {demoSwitcher ? (
          <div className="app-topbar__identity-slot">
            <form action={switchCurrentUser} className="app-topbar__identity-form">
              <label>
                <span>Роль</span>
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
          </div>
        ) : (
          <span className="app-topbar__user" title={user.email}>
            <Bell size={14} aria-hidden="true" />
            {user.name}
          </span>
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
                    <em>{command.modeLabel}</em>
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
