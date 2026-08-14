import { NextRequest, NextResponse } from "next/server";
import { AuthRequiredError, getCurrentUser } from "@/lib/current-user";
import { hasPermission } from "@/lib/auth/permissions";
import {
  parseReportAnalysisState,
  serializeReportAnalysisState
} from "@/lib/reports/report-analysis-state";
import {
  buildReportEvidenceDescriptorCatalog,
  findReportEvidenceDescriptor,
  resolveReportEvidence,
  unavailableReportEvidence,
  type ReportEvidenceDescriptorSelection,
  type ReportEvidenceResult
} from "@/lib/reports/report-evidence";
import { buildTrustedReportEvidenceHref } from "@/lib/reports/report-evidence-links";
import { loadReportFilterCatalog } from "@/lib/reports/report-filter-catalog";

export const dynamic = "force-dynamic";

// Session-auth companion to the reports page: the Evidence Sheet resolves
// URL-carried evidence identities on demand when no App Router navigation
// committed them (the Next 16.2.x client router can drop those commits on a
// fresh page load). The query string is the full report state, parsed exactly
// like the page does, so descriptor validation stays identical.
//
// With `from=<trusted evidence href>` the route re-mints instead of resolving
// directly: the pair in `from` was minted for an older report state, so its
// descriptor selection is recovered and rebuilt for the live state. The
// returned href keeps the live filters and still resolves after a reload.
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!hasPermission(user.role, "reports:read")) {
      return NextResponse.json(
        { error: "Недостаточно прав для выполнения операции." },
        { status: 403 }
      );
    }

    const searchInputFrom = (url: URL) => {
      const params: Record<string, string | string[] | undefined> = {};
      url.searchParams.forEach((value, key) => {
        if (key === "from") {
          return;
        }
        const current = params[key];
        params[key] =
          current === undefined
            ? value
            : Array.isArray(current)
              ? [...current, value]
              : [current, value];
      });
      return params;
    };

    const catalog = await loadReportFilterCatalog(user.workspaceId);
    const state = parseReportAnalysisState(
      searchInputFrom(request.nextUrl),
      catalog
    );

    const fromHref = request.nextUrl.searchParams.get("from");
    if (fromHref === null) {
      const evidence = await resolveReportEvidence({ user, state });
      return NextResponse.json(evidence, {
        headers: { "Cache-Control": "no-store" }
      });
    }

    let result: ReportEvidenceResult = unavailableReportEvidence;
    let href: string | null = null;
    try {
      const fromUrl = new URL(fromHref, request.nextUrl.origin);
      if (fromUrl.origin === request.nextUrl.origin && fromUrl.pathname === "/reports") {
        const fromState = parseReportAnalysisState(
          searchInputFrom(fromUrl),
          catalog
        );
        if (fromState.evidenceType && fromState.evidenceKey) {
          // The key alone is opaque; recover the descriptor selection by
          // rebuilding the catalog of the state the pair was minted for.
          // Selections carrying facets need the DB-backed trusted lists, so
          // only facet-free descriptors are recoverable here.
          const staleDescriptor = buildReportEvidenceDescriptorCatalog({
            workspaceId: user.workspaceId,
            state: fromState,
            catalog,
            reasons: [],
            operators: [],
            criteria: []
          }).find(
            (candidate) =>
              candidate.evidenceType === fromState.evidenceType &&
              candidate.key === fromState.evidenceKey
          );
          if (staleDescriptor) {
            const selection: ReportEvidenceDescriptorSelection = {
              evidenceType: staleDescriptor.evidenceType,
              metric: staleDescriptor.metric,
              ...(staleDescriptor.facet
                ? { facet: staleDescriptor.facet }
                : {}),
              ...(staleDescriptor.bucketStart
                ? { bucketStart: staleDescriptor.bucketStart }
                : {})
            };
            const minted = findReportEvidenceDescriptor({
              workspaceId: user.workspaceId,
              state,
              catalog,
              reasons: [],
              operators: [],
              criteria: [],
              selection
            });
            if (minted) {
              result = await resolveReportEvidence({
                user,
                state: {
                  ...state,
                  evidenceType: minted.evidenceType,
                  evidenceKey: minted.key
                }
              });
              href = buildTrustedReportEvidenceHref(
                serializeReportAnalysisState(state),
                minted,
                catalog
              );
            }
          }
        }
      }
    } catch {
      // A malformed `from` href falls through to the generic unavailable payload.
      href = null;
      result = unavailableReportEvidence;
    }

    return NextResponse.json(
      { href, result },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера." },
      { status: 500 }
    );
  }
}
