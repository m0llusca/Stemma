"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { demoRoleSwitchFormData, type DemoRoleSwitcher } from "@/lib/auth/demo-users";
import { switchCurrentUser } from "@/lib/user-actions";
import { buttonVariants } from "@/components/ui/button";
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
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        type="button"
        data-slot="account-menu"
        aria-label={`Профиль: ${switcher.roleLabel}, ${currentName}`}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full min-h-11 gap-1.5")}
      >
        <span className="min-w-0 truncate">{switcher.roleLabel}</span>
        <span className="min-w-0 truncate text-muted-foreground">{currentName}</span>
        <ChevronDown data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={8} className="w-72">
        <DemoRoleSwitchMenu switcher={switcher} />
        <DropdownMenuSeparator />
        {logout}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
