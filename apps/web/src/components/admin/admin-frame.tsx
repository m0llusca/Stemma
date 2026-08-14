import type { ReactNode } from "react";
import { AdminSubnav } from "@/components/admin/admin-subnav";
import { getCurrentUser } from "@/lib/current-user";
import { cn } from "@/lib/utils";

/**
 * Contained 2-column admin frame (redesign v2, plan B3).
 *
 * Pairs the contained {@link AdminSubnav} rail (~200px, left) with the page
 * content column. Used inside every admin screen's PageShell `children` so the
 * admin area gets its own local navigation without touching global chrome.
 * Collapses to a single column on narrow viewports (CSS-driven). Token-driven
 * via Tailwind semantic classes — holds in light and dark (Night Ops).
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
    <div
      className={cn(
        "grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-[204px_minmax(0,1fr)] lg:gap-7",
        className
      )}
    >
      <aside className="min-w-0 self-start lg:sticky lg:top-[calc(var(--app-topbar-height,3.5rem)+1.125rem)]">
        <AdminSubnav role={role} />
      </aside>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </div>
  );
}
