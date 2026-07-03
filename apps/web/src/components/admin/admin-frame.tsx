import type { ReactNode } from "react";
import clsx from "clsx";
import { AdminSubnav } from "@/components/admin/admin-subnav";
import { getCurrentUser } from "@/lib/current-user";

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
export async function AdminFrame({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  // Pass only the role across the server→client boundary; AdminSubnav (a
  // "use client" component) filters its own sections. Calling the client-module
  // helper filterAdminSubnavGroups() here would crash every admin page.
  const { role } = await getCurrentUser();

  return (
    <div className={clsx("admin-frame", className)}>
      <aside className="admin-frame__rail">
        <AdminSubnav role={role} />
      </aside>
      <div className="admin-frame__content">{children}</div>
    </div>
  );
}
