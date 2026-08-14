import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Two-pane master/detail shell for queue → workbench flows.
 *
 * The `list` pane (left, ~360px by default, independently scrollable) sits next
 * to a `detail` pane (right) that fills the remaining width. Below the lg
 * breakpoint (1024px) the layout collapses to a single column so it stays
 * usable on narrow viewports — the same breakpoint the review workbench pane
 * toggle switches on.
 * Layout is pure flex/grid + gap tokens; BEM hooks stay for workbench CSS.
 */
export function MasterDetail({
  list,
  detail,
  listWidth = "360px",
  className
}: {
  list: ReactNode;
  detail: ReactNode;
  /** Width of the list pane on wide viewports (any CSS length). */
  listWidth?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "master-detail grid w-full min-w-0 items-start gap-4",
        "grid-cols-1 lg:grid-cols-[var(--master-detail-list-width)_minmax(0,1fr)]",
        className
      )}
      style={{ "--master-detail-list-width": listWidth } as CSSProperties}
    >
      <div
        className={cn(
          "master-detail__list flex min-w-0 flex-col",
          "sticky top-[calc(var(--app-topbar-height)+1rem)] max-h-[calc(100vh-var(--app-topbar-height)-3rem)] overflow-y-auto",
          "max-lg:static max-lg:max-h-none max-lg:overflow-y-visible"
        )}
      >
        {list}
      </div>
      <div className="master-detail__detail min-w-0">{detail}</div>
    </div>
  );
}
