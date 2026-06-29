import type { ReactNode } from "react";
import clsx from "clsx";
import { AdminSubnav } from "@/components/admin/admin-subnav";

/**
 * Contained 2-column admin frame (redesign v2, plan B3).
 *
 * Pairs the contained {@link AdminSubnav} rail (~200px, left) with the page
 * content column. Used inside every admin screen's PageShell `children` so the
 * admin area gets its own local navigation without touching global chrome.
 * Collapses to a single column on narrow viewports (CSS-driven). Token-driven
 * (no raw hex) — holds in light and dark (Night Ops). Styling lives in
 * `src/app/styles/components/40-admin.css` under `.admin-frame*`.
 */
export function AdminFrame({
  children,
  className,
  rail = true
}: {
  children: ReactNode;
  className?: string;
  /** Render the contained sub-nav rail. Off for the admin index, which is itself the section grid. */
  rail?: boolean;
}) {
  if (!rail) {
    return (
      <div className={clsx("admin-frame admin-frame--solo", className)}>
        <div className="admin-frame__content">{children}</div>
      </div>
    );
  }

  return (
    <div className={clsx("admin-frame", className)}>
      <aside className="admin-frame__rail">
        <AdminSubnav />
      </aside>
      <div className="admin-frame__content">{children}</div>
    </div>
  );
}
