"use client";

import Link from "next/link";
import { Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type WorkPulseItem = {
  href: string;
  label: string;
  value: number;
  tone?: "neutral" | "risk" | "warning";
};

function pulseBadgeVariant(tone?: WorkPulseItem["tone"]) {
  if (tone === "risk") {
    return "destructive" as const;
  }
  if (tone === "warning") {
    return "secondary" as const;
  }
  return "outline" as const;
}

/**
 * Presentational work-pulse chrome (mobile menu + desktop badges).
 * Counts stream in via `AppNavPulseSignal` so the shell paints first.
 */
export function AppNavPulseChrome({ items }: { items: WorkPulseItem[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
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
            {items.map((item) => (
              <DropdownMenuItem
                key={item.label}
                render={
                  <Link href={item.href} aria-label={`${item.label}: ${item.value}`} />
                }
                nativeButton={false}
              >
                <span>{item.label}</span>
                <Badge variant={pulseBadgeVariant(item.tone)} className="ml-auto">
                  {item.value}
                </Badge>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex min-w-0 items-center gap-1">
        {items.map((item) => (
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
    </div>
  );
}
