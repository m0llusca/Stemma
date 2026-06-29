import type { CSSProperties, ReactNode } from "react";
import clsx from "clsx";

/**
 * Two-pane master/detail shell for queue → workbench flows.
 *
 * The `list` pane (left, ~360px by default, independently scrollable) sits next
 * to a `detail` pane (right) that fills the remaining width. Under ~900px the
 * layout collapses to a single column (CSS-driven) so it stays usable on narrow
 * viewports. Token-driven (no raw hex), holds across every theme including
 * Night Ops. All styling lives in `src/app/styles/components/07-shell.css`
 * under `.master-detail*`.
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
      className={clsx("master-detail", className)}
      style={{ "--master-detail-list-width": listWidth } as CSSProperties}
    >
      <div className="master-detail__list">{list}</div>
      <div className="master-detail__detail">{detail}</div>
    </div>
  );
}
