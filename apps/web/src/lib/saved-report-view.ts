import { prisma } from "@/lib/db";
import {
  canonicalizeReportAnalysisHref,
  parseReportAnalysisState,
  serializeReportAnalysisState,
  type ReportFilterCatalog
} from "@/lib/reports/report-analysis-state";
import { loadReportFilterCatalog } from "@/lib/reports/report-filter-catalog";

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
  const [catalog, views] = await Promise.all([
    loadReportFilterCatalog(workspaceId),
    prisma.savedReportView.findMany({
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
    })
  ]);

  return views.map((view) => ({
    ...view,
    href: safeReportsHref(view.href, catalog)
  }));
}

/**
 * Normalizes an arbitrary href to a safe internal `/reports` URL, dropping any
 * cross-origin or off-surface value (defense against open-redirect / stored
 * phishing in a saved view). Mirrors the reviews-surface normalizer.
 */
export function safeReportsHref(
  value: string,
  catalog: ReportFilterCatalog = { teams: [], sources: [], blocks: [] }
): string {
  const canonical = canonicalizeReportAnalysisHref(value, catalog);
  const params = Object.fromEntries(
    new URL(canonical, "https://reports.local").searchParams.entries()
  );
  delete params.evidenceType;
  delete params.evidenceKey;
  return serializeReportAnalysisState(
    parseReportAnalysisState(params, catalog)
  );
}
