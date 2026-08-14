"use client";

import { ClipboardCheck, MessagesSquare } from "lucide-react";
import { useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type WorkbenchPane = "dialog" | "score";

/**
 * Narrow-screen pane switch for the review workbench.
 *
 * When the two panes collapse to a single column (below the lg breakpoint,
 * CSS-driven), the long
 * transcript would otherwise stack ABOVE the scorecard, forcing reviewers to
 * scroll the whole conversation before grading. This segmented control flips a
 * `data-active-pane` attribute on the workbench root so the chosen pane is the
 * visible one; the CSS only acts on that attribute below the breakpoint, so the
 * full two-pane layout on wide screens is untouched and the toggle itself hides.
 *
 * Both panes stay mounted in the DOM (CSS visibility only), so form state,
 * field names and keyboard grading are all preserved across switches.
 */
export function WorkbenchPaneToggle({ targetId }: { targetId: string }) {
  const [pane, setPane] = useState<WorkbenchPane>("dialog");

  function select(next: WorkbenchPane) {
    setPane(next);

    if (typeof document === "undefined") {
      return;
    }

    const root = document.getElementById(targetId);
    root?.setAttribute("data-active-pane", next);
  }

  return (
    <ToggleGroup
      value={[pane]}
      onValueChange={(value) => {
        const next = value[0] as WorkbenchPane | undefined;
        if (next) {
          select(next);
        }
      }}
      orientation="horizontal"
      loopFocus
      variant="outline"
      size="sm"
      spacing={2}
      className="workbench-pane-toggle hidden w-full min-w-0 max-lg:flex"
      aria-label="Переключение панели"
    >
      <ToggleGroupItem
        value="dialog"
        className="flex-1"
        aria-pressed={pane === "dialog"}
        data-active={pane === "dialog" ? "true" : undefined}
      >
        <MessagesSquare data-icon="inline-start" aria-hidden="true" />
        Диалог
      </ToggleGroupItem>
      <ToggleGroupItem
        value="score"
        className="flex-1"
        aria-pressed={pane === "score"}
        data-active={pane === "score" ? "true" : undefined}
      >
        <ClipboardCheck data-icon="inline-start" aria-hidden="true" />
        Оценка
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
