"use client";

import type { ReactNode } from "react";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";

/**
 * Side sheet for operational evidence. Trigger stays in-flow; body opens in a
 * right-side Sheet so evidence does not crowd the main column.
 * Always starts closed — never force-open on first paint (no defaultOpen).
 */
export function EvidenceDrawer({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            variant="outline"
            className="h-auto min-w-0 w-full justify-between gap-3 px-4 py-3 text-left font-normal"
          />
        }
      >
        <span className="flex min-w-0 flex-col gap-0.5 whitespace-normal [overflow-wrap:anywhere]">
          <span className="text-sm font-medium text-foreground">{title}</span>
          {description ? (
            <span className="text-xs text-muted-foreground">{description}</span>
          ) : null}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">Показать</span>
      </SheetTrigger>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="gap-0 data-[side=right]:h-dvh data-[side=right]:w-full data-[side=right]:max-w-none data-[side=right]:sm:max-w-none data-[side=right]:min-[641px]:h-full data-[side=right]:min-[641px]:w-[28rem] data-[side=right]:min-[641px]:max-w-md"
      >
        <SheetHeader className="border-b border-border">
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        <SheetClose
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute right-3 top-3 size-11"
              aria-label="Закрыть"
            />
          }
        >
          <XIcon />
        </SheetClose>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
