"use client";

import { useId, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";

type QueueAdvancedFiltersProps = {
  activeCount: number;
  actions?: ReactNode;
  children: ReactNode;
  defaultOpen: boolean;
};

export function QueueAdvancedFilters({ activeCount, actions, children, defaultOpen }: QueueAdvancedFiltersProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

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
        <span className="queue-filterbar__advanced-count">{activeCount > 0 ? `${activeCount} применено` : "10 параметров"}</span>
        <ChevronDown className="queue-filterbar__advanced-chevron" size={15} aria-hidden="true" />
      </button>
      {actions}
      <div id={panelId} className="queue-filterbar__advanced-panel" hidden={!open}>
        {children}
      </div>
    </>
  );
}
