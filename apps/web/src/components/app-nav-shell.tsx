"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  ArrowRight,
  Bell,
  ChevronDown,
  ClipboardCheck,
  GraduationCap,
  Menu,
  MessageSquareText,
  Scale,
  Search,
  SlidersHorizontal,
  TrendingUp
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { switchCurrentUser } from "@/lib/user-actions";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";

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
  /** Гейт быстрого действия «Взять кейс»: false для ролей без reviews:write. */
  canTakeNextCase?: boolean;
};

const areaIcons = {
  today: Activity,
  feedback: MessageSquareText,
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

function pulseBadgeVariant(tone?: WorkPulseItem["tone"]) {
  if (tone === "risk") {
    return "destructive" as const;
  }
  if (tone === "warning") {
    return "secondary" as const;
  }
  return "outline" as const;
}

export function AppNavShell({
  navigation,
  pulseItems,
  user,
  demoSwitcher,
  branding = defaultNavBranding,
  areas = topNavAreas,
  canTakeNextCase = true
}: AppNavShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [commandOpen, setCommandOpen] = useState(false);
  const [areaMenuOpen, setAreaMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeBranding, setActiveBranding] = useState<WorkspaceBranding>(branding);
  const activeAreaId = useMemo(() => activeAreaForPath(pathname), [pathname]);
  const activeArea = areas.find((area) => area.id === activeAreaId);
  const visibleCommands = useMemo(
    () => navigation.commandItems.filter((command) => commandMatches(command, query)).slice(0, 9),
    [navigation.commandItems, query]
  );
  const demoUserName =
    demoSwitcher?.users.find((workspaceUser) => workspaceUser.id === demoSwitcher.currentUserId)?.name ??
    user.name;
  const ActiveAreaIcon = activeArea ? areaIcons[activeArea.icon] : null;

  const openCommand = useCallback(() => {
    setCommandOpen(true);
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

  // Mobile area menu: close on route change so a navigation always dismisses the panel.
  useEffect(() => {
    setAreaMenuOpen(false);
  }, [pathname]);

  // Reset search text when the palette closes so the next open starts clean.
  useEffect(() => {
    if (!commandOpen) {
      setQuery("");
    }
  }, [commandOpen]);

  const runCommand = useCallback(
    (href: string) => {
      setCommandOpen(false);
      router.push(href);
    },
    [router]
  );

  return (
    <header
      className="sticky top-0 z-20 border-b border-border bg-background"
      aria-label="Глобальная навигация"
      data-slot="app-nav"
    >
      <div className="flex min-h-14 w-full min-w-0 items-center gap-3 px-4 md:px-6">
        <Link
          href="/dashboard"
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

        <div className="@container/nav min-w-0 flex-1">
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
                  <Menu className={cn(activeArea && "md:hidden")} />
                  {activeArea && ActiveAreaIcon ? (
                    <>
                      <ActiveAreaIcon className="hidden md:block" data-icon="inline-start" />
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
                      const Icon = areaIcons[area.icon];
                      const isActive = area.id === activeAreaId;

                      return (
                        <DropdownMenuItem
                          key={area.id}
                          render={<Link href={area.href} />}
                          nativeButton={false}
                          title={area.description}
                          aria-current={isActive ? "page" : undefined}
                          className={cn(isActive && "bg-accent text-accent-foreground")}
                          onClick={() => setAreaMenuOpen(false)}
                        >
                          <Icon />
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
                  const Icon = areaIcons[area.icon];
                  const isActive = area.id === activeAreaId;

                  return (
                    <Link
                      key={area.id}
                      href={area.href}
                      data-slot="button"
                      title={area.description}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        buttonVariants({
                          variant: isActive ? "secondary" : "ghost",
                          size: "sm"
                        }),
                        "shrink-0"
                      )}
                    >
                      <Icon data-icon="inline-start" />
                      <span>{area.label}</span>
                    </Link>
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
          className="min-w-0 gap-2 text-muted-foreground md:w-9 md:flex-none md:px-0 xl:w-48 xl:px-3 xl:justify-start"
          aria-label="Поиск или команда"
          aria-haspopup="dialog"
          aria-expanded={commandOpen}
          onClick={openCommand}
        >
          <Search data-icon="inline-start" />
          <span className="hidden truncate xl:inline">Поиск или команда</span>
          <Kbd className="ml-auto hidden xl:inline-flex">⌘K</Kbd>
        </Button>

        <Separator orientation="vertical" className="hidden h-6 sm:block" />

        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2" aria-label="Рабочий пульс">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-11 sm:hidden"
                  aria-label="Рабочий пульс"
                />
              }
            >
              <Activity />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={8}
              className="w-60"
              // Base UI names the popup after the icon-only trigger (aria-labelledby →
              // trigger id, empty text), which would erase this menu's accessible name;
              // pin the name to the visible label instead.
              aria-labelledby="work-pulse-menu-label"
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel id="work-pulse-menu-label">Рабочий пульс</DropdownMenuLabel>
                {pulseItems.map((item) => (
                  <DropdownMenuItem
                    key={item.label}
                    render={
                      <Link
                        href={item.href}
                        aria-label={`${item.label}: ${item.value}`}
                      />
                    }
                    nativeButton={false}
                  >
                    <span>{item.label}</span>
                    <Badge
                      variant={pulseBadgeVariant(item.tone)}
                      className="ml-auto"
                    >
                      {item.value}
                    </Badge>
                  </DropdownMenuItem>
                ))}
                {canTakeNextCase ? (
                  <DropdownMenuItem
                    render={
                      <Link
                        href="/reviews?status=unreviewed"
                        aria-label="Взять следующий кейс"
                      />
                    }
                    nativeButton={false}
                  >
                    <ArrowRight />
                    <span>Взять следующий кейс</span>
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex min-w-0 items-center gap-1">
            {pulseItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                data-slot="button"
                aria-label={`${item.label}: ${item.value}`}
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "hidden h-8 shrink-0 gap-1.5 px-1.5 text-muted-foreground sm:inline-flex"
                )}
              >
                <span className="hidden text-xs 2xl:inline">{item.label}</span>
                <Badge variant={pulseBadgeVariant(item.tone)}>{item.value}</Badge>
              </Link>
            ))}
          </div>
          {canTakeNextCase ? (
            <Link
              href="/reviews?status=unreviewed"
              data-slot="button"
              aria-label="Взять следующий кейс"
              className={cn(
                buttonVariants({ size: "sm" }),
                "hidden shrink-0 sm:inline-flex"
              )}
            >
              <span className="hidden xl:inline">Взять кейс</span>
              <ArrowRight data-icon="inline-end" />
            </Link>
          ) : null}
        </div>

        <Separator orientation="vertical" className="hidden h-6 sm:block" />

        {demoSwitcher ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-11 min-w-11 max-w-44 shrink-0 gap-1.5"
                  aria-label={`Профиль: ${demoSwitcher.roleLabel}, ${demoUserName}`}
                />
              }
            >
              <span className="hidden min-w-0 flex-col items-start gap-0.5 text-left xl:flex">
                <span className="truncate text-sm font-medium leading-none">{demoSwitcher.roleLabel}</span>
                <span className="truncate text-xs text-muted-foreground">{demoUserName}</span>
              </span>
              <ChevronDown data-icon="inline-end" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Демо-доступ</DropdownMenuLabel>
              </DropdownMenuGroup>
              <form action={switchCurrentUser} className="flex flex-col gap-2 px-1.5 pb-1.5">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Демо-роль</span>
                  <NativeSelect
                    name="userId"
                    defaultValue={demoSwitcher.currentUserId}
                    aria-label="Демо-пользователь"
                    className="w-full"
                  >
                    {demoSwitcher.users.map((workspaceUser) => (
                      <NativeSelectOption key={workspaceUser.id} value={workspaceUser.id}>
                        {workspaceUser.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </label>
                <Button type="submit" size="sm">
                  Сменить
                </Button>
                <span className="text-xs text-muted-foreground">{demoSwitcher.roleLabel}</span>
              </form>
              <DropdownMenuSeparator />
              <form action="/auth/logout" method="post" className="px-1.5 pb-1">
                <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
                  Выйти
                </Button>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-11 min-w-11 max-w-48 shrink-0 gap-1.5"
                  title={user.email}
                  aria-label={`Профиль: ${user.name}`}
                />
              }
            >
              <span className="hidden min-w-0 flex-col items-start gap-0.5 text-left xl:flex">
                <span className="truncate text-sm font-medium leading-none">{user.name}</span>
                <span className="hidden truncate text-xs text-muted-foreground xl:inline">{user.email}</span>
              </span>
              <ChevronDown data-icon="inline-end" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="flex items-center gap-1.5 font-normal" title={user.email}>
                  <Bell />
                  <span className="truncate">{user.name}</span>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <form action="/auth/logout" method="post" className="px-1.5 pb-1">
                <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
                  Выйти
                </Button>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <CommandDialog
        open={commandOpen}
        onOpenChange={setCommandOpen}
        title="Поиск и команды"
        description="Найти раздел, очередь, интеграцию или действие"
        className="sm:max-w-lg"
      >
        <Command shouldFilter={false} className="rounded-xl!">
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Найти раздел, очередь, интеграцию или действие"
            aria-label="Поиск или команда"
          />
          <CommandList>
            <CommandEmpty>
              Ничего не найдено. Попробуйте “очередь”, “интеграции” или “обучение”.
            </CommandEmpty>
            <CommandGroup>
              {visibleCommands.map((command) => (
                <CommandItem
                  key={`${command.kind}:${command.href}:${command.label}`}
                  value={`${command.label} ${command.description} ${command.modeLabel} ${command.aliases.join(" ")}`}
                  onSelect={() => runCommand(command.href)}
                  className="items-start py-2"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="font-medium">{command.label}</span>
                    <span className="text-xs text-muted-foreground">{command.description}</span>
                  </span>
                  <span className="ml-auto flex shrink-0 items-center gap-1.5 self-center">
                    {command.kind === "action" ? (
                      <Badge variant="outline" className="font-normal">
                        Действие
                      </Badge>
                    ) : null}
                    <CommandShortcut className="tracking-normal normal-case">
                      {command.modeLabel}
                    </CommandShortcut>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </header>
  );
}
