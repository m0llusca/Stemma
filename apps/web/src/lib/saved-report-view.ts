import { prisma } from "@/lib/db";

/**
 * A saved report view: a named `/reports?...` URL capturing the current report
 * filters/period, mirroring the saved queue-view pattern for the reviews
 * surface. "private" views belong to a single user; "shared" views are visible
 * to the whole workspace.
 *
 * This module is the read seam consumed by the reports surface (B2). The
 * mutations + permission gating live in `saved-report-view-actions.ts`.
 */
export type SavedReportViewScope = "private" | "shared";

export type SavedReportViewSummary = {
  id: string;
  name: string;
  href: string;
  scope: string;
};

/**
 * Lists the saved report views visible to `userId` in this workspace: the
 * user's own private views plus every shared view, ordered the same way as
 * saved queue views (explicit order, then creation time).
 */
export async function listSavedReportViews(
  workspaceId: string,
  userId: string
): Promise<SavedReportViewSummary[]> {
  return prisma.savedReportView.findMany({
    where: {
      workspaceId,
      OR: [{ userId }, { scope: "shared" }]
    },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      href: true,
      scope: true
    }
  });
}

/**
 * Normalizes an arbitrary href to a safe internal `/reports` URL, dropping any
 * cross-origin or off-surface value (defense against open-redirect / stored
 * phishing in a saved view). Mirrors the reviews-surface normalizer.
 */
export function safeReportsHref(value: string): string {
  if (!value || !value.startsWith("/reports") || value.startsWith("//")) {
    return "/reports";
  }

  try {
    const parsed = new URL(value, "http://local.qc");

    if (parsed.origin !== "http://local.qc" || parsed.pathname !== "/reports") {
      return "/reports";
    }

    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "/reports";
  }
}
