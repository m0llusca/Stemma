"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  ArrowRight,
  Bell,
  ChevronDown,
  ClipboardCheck,
  Command,
  GraduationCap,
  Menu,
  Scale,
  Search,
  SlidersHorizontal,
  TrendingUp,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  activeAreaForPath,
  topNavAreas,
  type ShellCommandItem,
  type ShellNavArea,
  type ShellNavAreaIcon,
  type ShellNavigation
} from "@/lib/shell/navigation";
import { getTabbableElements, nextTabStop } from "@/lib/ui/focus-trap";
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
  areas?: ShellNavArea[];
};

const areaIcons = {
  today: Activity,
  review: ClipboardCheck,
  calibration: Scale,
  coaching: GraduationCap,
  analytics: TrendingUp,
  settings: SlidersHorizontal
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

export function AppNavShell({ navigation, pulseItems, user, demoSwitcher, branding = defaultNavBranding, areas = topNavAreas }: AppNavShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [commandOpen, setCommandOpen] = useState(false);
  const [areaMenuOpen, setAreaMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeBranding, setActiveBranding] = useState<WorkspaceBranding>(branding);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);
  const areaMenuRef = useRef<HTMLDivElement>(null);
  const areaMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const activeAreaId = useMemo(() => activeAreaForPath(pathname), [pathname]);
  const visibleCommands = useMemo(
    () => navigation.commandItems.filter((command) => commandMatches(command, query)).slice(0, 9),
    [navigation.commandItems, query]
  );
  const demoUserName = demoSwitcher?.users.find((workspaceUser) => workspaceUser.id === demoSwitcher.currentUserId)?.name ?? user.name;

  const openCommand = useCallback((event?: { currentTarget: HTMLElement }) => {
    if (event) {
      lastTriggerRef.current = event.currentTarget;
    } else if (typeof document !== "undefined") {
      lastTriggerRef.current = document.activeElement as HTMLElement | null;
    }

    setCommandOpen(true);
  }, []);

  const closeCommand = useCallback(() => {
    setCommandOpen(false);
  }, []);

  const closeAreaMenu = useCallback(() => {
    setAreaMenuOpen(false);
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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openCommand();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openCommand]);

  // Reset the keyboard highlight whenever the result set changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [query, commandOpen]);

  // While the palette is open: lock body scroll, mark the rest of the page
  // inert/aria-hidden, focus the search input, and restore focus + page state
  // on close. The palette dialog is rendered inside this header, so we hide the
  // sibling page content rather than the header itself.
  useEffect(() => {
    if (!commandOpen || typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const inertTargets = Array.from(document.querySelectorAll<HTMLElement>("body > .page > *")).filter(
      (node) => !node.contains(panelRef.current)
    );
    for (const node of inertTargets) {
      node.setAttribute("aria-hidden", "true");
      node.setAttribute("inert", "");
    }

    // Escape closes from anywhere, not only when focus is inside the panel.
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeCommand();
      }
    };
    window.addEventListener("keydown", handleEscape);

    searchInputRef.current?.focus();

    return () => {
      window.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = previousOverflow;
      for (const node of inertTargets) {
        node.removeAttribute("aria-hidden");
        node.removeAttribute("inert");
      }

      const trigger = lastTriggerRef.current;
      if (trigger && typeof trigger.focus === "function") {
        trigger.focus();
      }
    };
  }, [commandOpen, closeCommand]);

  const handlePaletteKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeCommand();
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) => (visibleCommands.length === 0 ? 0 : (index + 1) % visibleCommands.length));
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) =>
          visibleCommands.length === 0 ? 0 : (index - 1 + visibleCommands.length) % visibleCommands.length
        );
        return;
      }

      if (event.key === "Enter") {
        const command = visibleCommands[activeIndex];
        if (command) {
          event.preventDefault();
          closeCommand();
          router.push(command.href);
        }
        return;
      }

      if (event.key === "Tab") {
        const panel = panelRef.current;
        if (!panel) {
          return;
        }

        const tabbable = getTabbableElements(panel);
        const target = nextTabStop(tabbable, document.activeElement, event.shiftKey);
        if (target) {
          event.preventDefault();
          target.focus();
        }
      }
    },
    [activeIndex, closeCommand, router, visibleCommands]
  );

  // Mobile area-disclosure menu: close on route change so a navigation always
  // dismisses the panel even when the click target is intercepted upstream.
  useEffect(() => {
    setAreaMenuOpen(false);
  }, [pathname]);

  // While the area menu is open: Escape closes it, an outside pointer dismisses
  // it, and focus is moved into the panel then restored to the trigger on close.
  useEffect(() => {
    if (!areaMenuOpen || typeof document === "undefined") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAreaMenu();
      }
    };

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (
        target &&
        !areaMenuRef.current?.contains(target) &&
        !areaMenuTriggerRef.current?.contains(target)
      ) {
        closeAreaMenu();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);

    const firstItem = areaMenuRef.current?.querySelector<HTMLElement>("[role='menuitem']");
    firstItem?.focus();

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
      if (areaMenuTriggerRef.current && typeof areaMenuTriggerRef.current.focus === "function") {
        areaMenuTriggerRef.current.focus();
      }
    };
  }, [areaMenuOpen, closeAreaMenu]);

  const handleAreaMenuKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const menu = areaMenuRef.current;
      if (!menu) {
        return;
      }

      const items = getTabbableElements(menu);
      if (items.length === 0) {
        return;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const target = nextTabStop(items, document.activeElement, event.key === "ArrowUp");
        target?.focus();
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        items[0]?.focus();
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        items[items.length - 1]?.focus();
        return;
      }

      if (event.key === "Tab") {
        const target = nextTabStop(items, document.activeElement, event.shiftKey);
        if (target) {
          event.preventDefault();
          target.focus();
        }
      }
    },
    []
  );

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

        <div className="app-nav__menu">
          <button
            ref={areaMenuTriggerRef}
            type="button"
            className="app-nav__menu-trigger"
            aria-haspopup="menu"
            aria-expanded={areaMenuOpen}
            aria-label="Разделы"
            onClick={() => setAreaMenuOpen((open) => !open)}
          >
            <Menu size={18} aria-hidden="true" />
          </button>
          {areaMenuOpen ? (
            <div
              ref={areaMenuRef}
              className="app-nav__menu-popover"
              role="menu"
              aria-label="Основные разделы"
              onKeyDown={handleAreaMenuKeyDown}
            >
              {areas.map((area) => {
                const Icon = areaIcons[area.icon];
                const isActive = area.id === activeAreaId;

                return (
                  <Link
                    key={area.id}
                    href={area.href}
                    role="menuitem"
                    title={area.description}
                    aria-current={isActive ? "page" : undefined}
                    className={`app-nav__menu-item ${isActive ? "app-nav__menu-item--active" : ""}`}
                    onClick={closeAreaMenu}
                  >
                    <Icon size={16} aria-hidden="true" />
                    <span>{area.label}</span>
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>

        <nav className="app-nav__areas" aria-label="Основные разделы">
          {areas.map((area) => {
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

        <button
          type="button"
          className="app-command-trigger app-nav__command"
          aria-haspopup="dialog"
          aria-expanded={commandOpen}
          onClick={openCommand}
        >
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
        <div
          className="command-palette"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeCommand();
            }
          }}
        >
          <div
            ref={panelRef}
            className="command-palette__panel"
            role="dialog"
            aria-modal="true"
            aria-label="Поиск и команды"
            onKeyDown={handlePaletteKeyDown}
          >
            <div className="command-palette__search">
              <Command size={16} aria-hidden="true" />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Найти раздел, очередь, интеграцию или действие"
                aria-label="Поиск или команда"
                role="combobox"
                aria-expanded={visibleCommands.length > 0}
                aria-controls="command-palette-results"
              />
              <button type="button" onClick={closeCommand} aria-label="Закрыть поиск">
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="command-palette__list" id="command-palette-results" role="listbox">
              {visibleCommands.length > 0 ? (
                visibleCommands.map((command, index) => (
                  <Link
                    key={`${command.kind}:${command.href}:${command.label}`}
                    href={command.href}
                    role="option"
                    aria-selected={index === activeIndex}
                    data-active={index === activeIndex ? "true" : undefined}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={closeCommand}
                  >
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
