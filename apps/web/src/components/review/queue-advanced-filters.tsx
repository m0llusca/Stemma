"use client";

import { useId, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";

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
      <button
        type="button"
        className="action-button queue-filterbar__advanced-button"
        aria-controls={panelId}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <SlidersHorizontal size={16} aria-hidden="true" />
        <span>Точные фильтры</span>
        <span className="queue-filterbar__advanced-count">{counterLabel}</span>
        <ChevronDown className="queue-filterbar__advanced-chevron" size={15} aria-hidden="true" />
      </button>
      {actions}
      <div id={panelId} className="queue-filterbar__advanced-panel" hidden={!open}>
        {children}
      </div>
    </>
  );
}
