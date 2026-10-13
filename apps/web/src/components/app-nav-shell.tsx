"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Activity,
  Bell,
  BookOpen,
  BookOpenCheck,
  ChartColumn,
  ChartSpline,
  CircleEqual,
  ClipboardCheck,
  ClipboardList,
  Gauge,
  Menu,
  MessageSquare,
  MessageSquareReply,
  Scale,
  Search,
  Settings2,
  SlidersHorizontal,
  X,
  type LucideIcon
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { isAuthPath } from "@/lib/auth/auth-path";
import {
  activeAreaForPath,
  topNavAreas,
  type ShellCommandItem,
  type ShellNavArea,
  type ShellNavAreaIcon,
  type ShellNavigation
} from "@/lib/shell/navigation";
import {
  resolveWorkspaceBranding,
  type WorkspaceBranding
} from "@/lib/ui-branding";
import { cn } from "@/lib/utils";
import { AccountMenuDisclosure } from "@/components/auth/demo-role-switch";
import { DisclosureMorphChevron } from "@/components/ui/disclosure-morph-chevron";
import { MorphIcon } from "@/components/ui/morph-icon";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { CommandDialog } from "@/components/ui/command-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";


type AppNavShellProps = {
  navigation: ShellNavigation;
  /** Streamed work-pulse chrome (async signal). Empty/null hides the slot. */
  pulseSlot?: ReactNode;
  user: {
    name: string;
    email: string;
    /** Sync role label — do not wait on demo switcher for profile chrome. */
    roleLabel?: string;
  };
  /** Streamed demo role-switch menu (async signal). */
  demoMenuSlot?: ReactNode;
  branding?: WorkspaceBranding;
  areas?: ShellNavArea[];
  /** Role home from `roleHomePath` — never hardcode `/dashboard` (SUPPORT_AGENT stays off ops pulse). */
  homeHref?: string;
  /** Гейт быстрого действия «Взять следующий»: false для ролей без reviews:write. */
  canTakeNextCase?: boolean;
};

/**
 * Idle glyphs for primary area nav — product metaphor first, morph-friendly pairs
 * second (same Lucide family / shared silhouette when possible).
 */
const areaIcons = {
  today: Gauge,
  feedback: MessageSquare,
  review: ClipboardList,
  calibration: Scale,
  coaching: BookOpen,
  analytics: ChartColumn,
  settings: SlidersHorizontal
} satisfies Record<ShellNavAreaIcon, LucideIcon>;

/**
 * Active/hover morph targets — related Lucide shapes Morphicons interpolate toward.
 * Avoid medical (HeartPulse), courtroom (Gavel), and multi-thread chat metaphors.
 */
const areaActiveIcons = {
  today: Activity,
  feedback: MessageSquareReply,
  review: ClipboardCheck,
  calibration: CircleEqual,
  coaching: BookOpenCheck,
  analytics: ChartSpline,
  settings: Settings2
} satisfies Record<ShellNavAreaIcon, LucideIcon>;

const defaultNavBranding = resolveWorkspaceBranding({});

function AreaNavMorphIcon({
  areaIcon,
  emphasized,
  className
}: {
  areaIcon: ShellNavAreaIcon;
  emphasized: boolean;
  className?: string;
}) {
  return (
    <MorphIcon
      icon={emphasized ? areaActiveIcons[areaIcon] : areaIcons[areaIcon]}
      data-icon="inline-start"
      className={className}
    />
  );
}

function AreaNavLink({
  area,
  isActive,
  className
}: {
  area: ShellNavArea;
  isActive: boolean;
  className?: string;
}) {
  const [hot, setHot] = useState(false);
  const activate = () => setHot(true);
  const deactivate = () => setHot(false);

  return (
    <Link
      href={area.href}
      prefetch={false}
      data-slot="button"
      title={area.description}
      aria-current={isActive ? "page" : undefined}
      onMouseEnter={activate}
      onMouseLeave={deactivate}
      onFocus={activate}
      onBlur={deactivate}
      className={className}
    >
      <AreaNavMorphIcon areaIcon={area.icon} emphasized={isActive || hot} />
      <span>{area.label}</span>
    </Link>
  );
}

const AppCommandList = lazy(() => import("@/components/app-command-list"));

export function AppNavShell(props: AppNavShellProps) {
  const pathname = usePathname();
  // Resolve pathname before `useSearchParams` so auth routes never suspend
  // into the header-height fallback.
  if (isAuthPath(pathname)) {
    return null;
  }

  return <AppNavShellChrome {...props} />;
}

function AppNavShellChrome({
  navigation,
  pulseSlot,
  user,
  demoMenuSlot,
  branding = defaultNavBranding,
  areas = topNavAreas,
  homeHref = "/dashboard",
  canTakeNextCase = false
}: AppNavShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [commandOpen, setCommandOpen] = useState(false);

  const [areaMenuOpen, setAreaMenuOpen] = useState(false);
  const [activeBranding, setActiveBranding] = useState<WorkspaceBranding>(branding);
  const search = searchParams.toString();
  const activeAreaId = useMemo(
    () => activeAreaForPath(pathname, { search, areas }),
    [pathname, search, areas]
  );
  const activeArea = areas.find((area) => area.id === activeAreaId);
  // Pulse chrome is badges only — Take next lives on the queue page / ⌘K, not the top bar.
  const roleLabel = user.roleLabel;
  const hasDemoMenu = demoMenuSlot != null;

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
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Mobile area menu: close on route change so a navigation always dismisses the panel.
  useEffect(() => {
    setAreaMenuOpen(false);
  }, [pathname]);


  return (
    <header
      className="sticky top-0 z-20 border-b border-border bg-background"
      aria-label="Глобальная навигация"
      data-slot="app-nav"
    >
      <div className="flex min-h-14 w-full min-w-0 items-center gap-2 px-(--app-topbar-inline) sm:gap-3">
        <Link
          href={homeHref}
          prefetch={false}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label={activeBranding.brandLogoAlt}
        >
          <span
            className={cn(
              "flex size-8 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted text-sm font-bold text-foreground",
              activeBranding.brandLogoUrl && "bg-background"
            )}
          >
            {activeBranding.brandLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- workspace-branded remote/static logo URL
              <img
                src={activeBranding.brandLogoUrl}
                alt={activeBranding.brandLogoAlt}
                className="size-full object-contain p-1"
              />
            ) : (
              activeBranding.brandMark
            )}
          </span>
        </Link>

        <div className="@container/nav min-w-11 flex-1">
          {areas.length > 0 ? (
            <>
              <DropdownMenu open={areaMenuOpen} onOpenChange={setAreaMenuOpen}>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      className="min-h-11 min-w-11 md:w-auto md:px-3 @2xl/nav:hidden"
                      aria-label="Разделы"
                    />
                  }
                >
                  <MorphIcon icon={areaMenuOpen ? X : Menu} className={cn(activeArea && "md:hidden")} />
                  {activeArea ? (
                    <>
                      <AreaNavMorphIcon
                        areaIcon={activeArea.icon}
                        emphasized
                        className="hidden md:block"
                      />
                      <span className="hidden md:inline">{activeArea.label}</span>
                    </>
                  ) : (
                    <span className="hidden md:inline">Разделы</span>
                  )}
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  sideOffset={8}
                  className="w-56"
                  aria-label="Основные разделы"
                >
                  <DropdownMenuGroup>
                    {areas.map((area) => {
                      const isActive = area.id === activeAreaId;

                      return (
                        <DropdownMenuItem
                          key={area.id}
                          render={<Link href={area.href} prefetch={false} />}
                          nativeButton={false}
                          title={area.description}
                          aria-current={isActive ? "page" : undefined}
                          className={cn(isActive && "bg-accent text-accent-foreground")}
                          onClick={() => setAreaMenuOpen(false)}
                        >
                          <AreaNavMorphIcon areaIcon={area.icon} emphasized={isActive} />
                          <span>{area.label}</span>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <nav
                className="hidden min-w-0 items-center gap-0.5 @2xl/nav:flex"
                aria-label="Основные разделы"
              >
                {areas.map((area) => {
                  const isActive = area.id === activeAreaId;

                  return (
                    <AreaNavLink
                      key={area.id}
                      area={area}
                      isActive={isActive}
                      className={cn(
                        buttonVariants({
                          variant: isActive ? "secondary" : "ghost",
                          size: "sm"
                        }),
                        "shrink-0"
                      )}
                    />
                  );
                })}
              </nav>
            </>
          ) : null}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="size-11 shrink-0 gap-2 px-0 text-muted-foreground md:size-9 md:flex-none xl:h-9 xl:w-56 xl:px-3 xl:justify-start"
          aria-label="Поиск или команда"
          aria-haspopup="dialog"
          aria-expanded={commandOpen}
          onClick={() => setCommandOpen(true)}
        >
          <MorphIcon icon={commandOpen ? X : Search} data-icon="inline-start" />
          <span className="hidden truncate xl:inline" title="Поиск или команда">Поиск или команда</span>
          <Kbd className="ml-auto hidden xl:inline-flex">⌘K</Kbd>
        </Button>

        <Separator orientation="vertical" className="hidden h-6 sm:block" />

        {pulseSlot}

        <Separator orientation="vertical" className="hidden h-6 sm:block" />

        <AccountMenuDisclosure
          triggerAriaLabel={
            roleLabel
              ? `Профиль: ${roleLabel}, ${user.name}`
              : `Профиль: ${user.name}`
          }
          triggerTitle={
            roleLabel ? `${roleLabel} · ${user.email}` : user.email
          }
          triggerClassName={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "relative z-30 min-h-11 shrink-0 gap-1.5 px-2"
          )}
          align="end"
          dismissKey={pathname}
          panelClassName={hasDemoMenu ? "w-72" : "w-56"}
          panel={
            <>
              <div
                className="flex items-center gap-1.5 px-1.5 py-1 text-xs font-medium text-muted-foreground"
                title={user.email}
              >
                <Bell className="size-4" />
                <span className="truncate">{user.name}</span>
              </div>
              {demoMenuSlot ? (
                <>
                  <div className="-mx-1 my-1 h-px bg-border" role="separator" />
                  {demoMenuSlot}
                </>
              ) : null}
              <div className="-mx-1 my-1 h-px bg-border" role="separator" />
              <form action="/auth/logout" method="post" className="px-1.5 pb-1">
                <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
                  Выйти
                </Button>
              </form>
            </>
          }
        >
          <UserAvatar name={user.name} className="size-7 sm:size-8" />
          <span className="hidden min-w-0 max-w-[15rem] flex-col items-start gap-0.5 text-left lg:flex">
            <span
              className="text-pretty text-sm font-medium leading-tight"
              title={roleLabel ?? user.name}
            >
              {roleLabel ?? user.name}
            </span>
            <span className="w-full truncate text-xs text-muted-foreground" title={user.email}>
              {user.email}
            </span>
          </span>
          <DisclosureMorphChevron data-icon="inline-end" />
        </AccountMenuDisclosure>
      </div>

      <CommandDialog
        open={commandOpen}
        onOpenChange={setCommandOpen}
        title="Поиск и команды"
        description="Найти раздел, очередь, интеграцию или действие"
        className="sm:max-w-lg"
      >
        {commandOpen ? (
          <Suspense fallback={<div role="status" className="p-4 text-sm text-muted-foreground">Загрузка команд…</div>}>
            <AppCommandList commands={navigation.commandItems} canTakeNextCase={canTakeNextCase} onClose={() => setCommandOpen(false)} />
          </Suspense>
        ) : null}
      </CommandDialog>
    </header>
  );
}
