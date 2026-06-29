"use client";

import { ClipboardCheck, MessagesSquare } from "lucide-react";
import { useState } from "react";

type WorkbenchPane = "dialog" | "score";

/**
 * Narrow-screen pane switch for the review workbench.
 *
 * When the two panes collapse to a single column (≤1100px, CSS-driven), the long
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
    <div className="workbench-pane-toggle" role="group" aria-label="Переключение панели">
      <button
        type="button"
        className="workbench-pane-toggle__btn"
        data-active={pane === "dialog" ? "true" : undefined}
        aria-pressed={pane === "dialog"}
        onClick={() => select("dialog")}
      >
        <MessagesSquare size={15} aria-hidden="true" />
        Диалог
      </button>
      <button
        type="button"
        className="workbench-pane-toggle__btn"
        data-active={pane === "score" ? "true" : undefined}
        aria-pressed={pane === "score"}
        onClick={() => select("score")}
      >
        <ClipboardCheck size={15} aria-hidden="true" />
        Оценка
      </button>
    </div>
  );
}
