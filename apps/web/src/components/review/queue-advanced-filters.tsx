"use client";

import { useId, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/utils";

type QueueAdvancedFiltersProps = {
  activeCount: number;
  actions?: ReactNode;
  children: ReactNode;
  defaultOpen: boolean;
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

export function QueueAdvancedFilters({
  activeCount,
  actions,
  children,
  defaultOpen,
  parameterCount
}: QueueAdvancedFiltersProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const counterLabel = activeCount > 0 ? `${activeCount} применено` : formatParameterCount(parameterCount);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="queue-filterbar__advanced-button min-w-[196px] justify-start"
        aria-controls={panelId}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <SlidersHorizontal size={16} aria-hidden="true" data-icon="inline-start" />
        <span>Точные фильтры</span>
        <Chip tone="neutral" className="queue-filterbar__advanced-count ml-1">
          {counterLabel}
        </Chip>
        <ChevronDown
          className={cn("queue-filterbar__advanced-chevron ml-auto transition-transform", open && "rotate-180")}
          size={15}
          aria-hidden="true"
        />
      </Button>
      {actions}
      <div id={panelId} className="queue-filterbar__advanced-panel" hidden={!open}>
        {children}
      </div>
    </>
  );
}
