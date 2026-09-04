"use client";

import { useId, useState } from "react";
import type { ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { QUEUE_GLOSSARY } from "@/components/guidance/queue-glossary";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";

type QueueAdvancedFiltersProps = {
  activeCount: number;
  actions?: ReactNode;
  children: ReactNode;
  defaultOpen: boolean;
  formId: string;
  parameterCount: number;
};

function formatParameterCount(count: number) {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return `${count} параметров`;
  }

  if (lastDigit === 1) {
    return `${count} параметр`;
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return `${count} параметра`;
  }

  return `${count} параметров`;
}

/**
 * Advanced queue filters live in a Sheet (not permanent chrome). Fields use the
 * `form` attribute so FormData still belongs to the outer AutoSubmitFilterForm
 * even though Sheet portals out of the DOM tree.
 */
export function QueueAdvancedFilters({
  activeCount,
  actions,
  children,
  defaultOpen,
  formId,
  parameterCount
}: QueueAdvancedFiltersProps) {
  const [open, setOpen] = useState(defaultOpen);
  const titleId = useId();
  const counterLabel = activeCount > 0 ? `${activeCount} применено` : formatParameterCount(parameterCount);

  function relayFormEvent() {
    const form = document.getElementById(formId);
    if (form instanceof HTMLFormElement) {
      form.requestSubmit();
    }
  }

  return (
    <>
      <div className="queue-filterbar__advanced flex min-w-0 flex-col gap-1.5 sm:col-span-2 xl:col-span-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  className="queue-filterbar__advanced-button w-full min-w-[196px] justify-start whitespace-nowrap sm:w-auto"
                />
              }
            >
              <SlidersHorizontal size={16} aria-hidden="true" data-icon="inline-start" />
              <span>Точные фильтры</span>
              <Chip tone="neutral" className="queue-filterbar__advanced-count ml-1">
                {counterLabel}
              </Chip>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="queue-filterbar__advanced-sheet gap-0 data-[side=right]:w-full data-[side=right]:max-w-none data-[side=right]:sm:max-w-md max-sm:data-[side=right]:inset-y-0"
              aria-labelledby={titleId}
              onChange={(event) => {
                const target = event.target;
                if (
                  target instanceof HTMLInputElement ||
                  target instanceof HTMLSelectElement ||
                  target instanceof HTMLTextAreaElement
                ) {
                  if (target.type === "text" || target.type === "search" || target.type === "") {
                    return;
                  }
                  relayFormEvent();
                }
              }}
              onInput={(event) => {
                const target = event.target;
                if (
                  (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) &&
                  (target.type === "text" || target.type === "search" || target.type === "")
                ) {
                  // Debounce is owned by AutoSubmitFilterForm; requestSubmit still goes through it.
                  relayFormEvent();
                }
              }}
            >
              <SheetHeader className="border-b border-border">
                <SheetTitle id={titleId}>Точные фильтры</SheetTitle>
                <SheetDescription>
                  Дополнительные параметры очереди. На узком экране лист закрывает список — один слой фокуса.
                </SheetDescription>
              </SheetHeader>
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
                <div className="queue-filterbar__advanced-grid grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                  {children}
                </div>
              </div>
            </SheetContent>
          </Sheet>
          <HelpTooltip
            label={QUEUE_GLOSSARY.exactFilters.label}
            content={QUEUE_GLOSSARY.exactFilters.content}
            placement="top-start"
          />
        </div>
        <p className="text-xs text-muted-foreground" data-slot="exact-filters-help">
          Редкие срезы (источник, SLA, риск) — в панели, чтобы не мешать «Взять следующий».
        </p>
      </div>
      {actions}
    </>
  );
}
