"use client";

import { ChevronDown, Users } from "lucide-react";
import { demoRoleSwitchFormData, type DemoRoleSwitcher } from "@/lib/auth/demo-users";
import { switchCurrentUser } from "@/lib/user-actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type DemoRoleSwitchProps = {
  switcher: DemoRoleSwitcher;
  /** Header: compact chrome. Page: full-width CTA on pending-access. */
  variant?: "header" | "page";
};

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

export function DemoRoleSwitch({ switcher, variant = "header" }: DemoRoleSwitchProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant={variant === "page" ? "outline" : "ghost"}
            size="sm"
            className={cn(
              "shrink-0 gap-1.5",
              variant === "header" ? "min-h-11 min-w-11" : "w-full min-h-11"
            )}
            aria-label="Сменить роль"
          />
        }
      >
        <Users data-icon="inline-start" />
        <span className={variant === "header" ? "hidden md:inline" : undefined}>Сменить роль</span>
        <ChevronDown data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={variant === "header" ? "end" : "start"}
        sideOffset={8}
        className="w-72"
        aria-label="Сменить роль"
      >
        <DemoRoleSwitchMenu switcher={switcher} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
