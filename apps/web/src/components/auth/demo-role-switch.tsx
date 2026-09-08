"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { demoRoleSwitchFormData, type DemoRoleSwitcher } from "@/lib/auth/demo-users";
import { switchCurrentUser } from "@/lib/user-actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Survives AppNavShell remount (Suspense + useSearchParams). Synced from
 * controlled `open` — same mechanism as the working area-menu DropdownMenu.
 */
let accountMenuOpen = false;

export function resetAccountMenuExpandedForTests() {
  accountMenuOpen = false;
}

type ButtonVariant = "ghost" | "outline";

type AccountMenuDisclosureProps = {
  triggerAriaLabel: string;
  triggerTitle?: string;
  triggerClassName?: string;
  triggerVariant?: ButtonVariant;
  panelClassName?: string;
  align?: "start" | "end";
  /** Parent sets this to the current route so navigation dismisses the panel. */
  dismissKey?: string;
  children: ReactNode;
  panel: ReactNode;
};

/**
 * Account menu via the same Base UI DropdownMenu as the LIVE-working area menu:
 * controlled `open` / `onOpenChange`, `DropdownMenuTrigger render={<Button />}`.
 */
export function AccountMenuDisclosure({
  triggerAriaLabel,
  triggerTitle,
  triggerClassName,
  triggerVariant = "ghost",
  panelClassName,
  align = "end",
  dismissKey,
  children,
  panel
}: AccountMenuDisclosureProps) {
  const prevDismissKeyRef = useRef(dismissKey);
  const [open, setOpen] = useState(() => accountMenuOpen);

  const handleOpenChange = (next: boolean) => {
    accountMenuOpen = next;
    setOpen(next);
  };

  useEffect(() => {
    if (prevDismissKeyRef.current === dismissKey) {
      return;
    }
    prevDismissKeyRef.current = dismissKey;
    handleOpenChange(false);
  }, [dismissKey]);

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger
        data-slot="account-menu"
        render={
          <Button
            type="button"
            variant={triggerVariant}
            size="sm"
            data-slot="account-menu"
            title={triggerTitle}
            aria-label={triggerAriaLabel}
            aria-expanded={open ? "true" : "false"}
            className={cn(align === "start" && "w-full", triggerClassName)}
          />
        }
      >
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        sideOffset={8}
        className={panelClassName}
        data-slot="account-menu-panel"
      >
        {panel}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DemoRoleSwitchMenu({ switcher }: { switcher: DemoRoleSwitcher }) {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>Сменить роль</DropdownMenuLabel>
      {switcher.users.map((user) => {
        const isCurrent = user.id === switcher.currentUserId;

        return (
          <DropdownMenuItem
            key={user.id}
            disabled={isCurrent}
            aria-current={isCurrent ? "true" : undefined}
            onClick={() => {
              if (isCurrent) {
                return;
              }

              void switchCurrentUser(demoRoleSwitchFormData(user.id));
            }}
          >
            <span className="min-w-0 truncate">{user.optionLabel}</span>
          </DropdownMenuItem>
        );
      })}
    </DropdownMenuGroup>
  );
}

type DemoAccountMenuProps = {
  switcher: DemoRoleSwitcher;
  logout: ReactNode;
};

/** Single account menu for surfaces without AppNav (VIEWER pending-access). */
export function DemoAccountMenu({ switcher, logout }: DemoAccountMenuProps) {
  const currentName =
    switcher.users.find((user) => user.id === switcher.currentUserId)?.name ?? switcher.roleLabel;

  return (
    <AccountMenuDisclosure
      triggerAriaLabel={`Профиль: ${switcher.roleLabel}, ${currentName}`}
      triggerVariant="outline"
      triggerClassName="min-h-11 gap-1.5"
      align="start"
      panelClassName="w-72"
      panel={
        <>
          <DemoRoleSwitchMenu switcher={switcher} />
          <DropdownMenuSeparator />
          {logout}
        </>
      }
    >
      <span className="min-w-0 truncate">{switcher.roleLabel}</span>
      <span className="min-w-0 truncate text-muted-foreground">{currentName}</span>
      <ChevronDown data-icon="inline-end" />
    </AccountMenuDisclosure>
  );
}
