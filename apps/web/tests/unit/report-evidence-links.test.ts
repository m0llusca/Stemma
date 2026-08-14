import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildTrustedReportEvidenceHref,
  reportPageLocalLinkProps,
  reportEvidenceNavigationOptions,
  relinkReportChartModel,
  relinkReportRows
} from "@/lib/reports/report-evidence-links";
import { buildReportEvidenceDescriptorCatalog } from "@/lib/reports/report-evidence";

const currentHref =
  "/reports?view=performance&period=vk-current&compare=previous&grain=week&chartView=graph&series=score%2Cvolume";
const catalog = { teams: [], sources: [], blocks: [] };
const descriptors = {
  trend: {
    evidenceType: "trend" as const,
    key: `ev1_${"A".repeat(43)}` as const
  },
  driver: {
    evidenceType: "driver" as const,
    key: `ev1_${"B".repeat(43)}` as const
  },
  matrix: {
    evidenceType: "matrix" as const,
    key: `ev1_${"C".repeat(43)}` as const
  },
  kpi: {
    evidenceType: "kpi" as const,
    key: `ev1_${"D".repeat(43)}` as const
  }
};
const reportsPageSource = readFileSync(
  join(process.cwd(), "src/app/reports/page.tsx"),
  "utf8"
);

describe("report evidence model links", () => {
  it("disables automatic prefetch for safe report-page local links without changing their scroll behavior", () => {
    for (const href of [
      "/reports",
      "/reports?view=performance",
      "/reviews",
      "/reviews/conversation-1?tab=score"
    ]) {
      expect(reportPageLocalLinkProps(href)).toEqual({
        prefetch: false
      });
    }
  });

  it("does not change navigation for external, malformed, or unrelated links", () => {
    for (const href of [
      "https://example.com/reports",
      "//example.com/reviews",
      "/admin/reports",
      "/api/reports/export",
      "not-a-route"
    ]) {
      expect(reportPageLocalLinkProps(href)).toBeUndefined();
    }
  });

  it("preserves scroll only for exact trusted evidence while suppressing every report-local prefetch", () => {
    const hrefs = Object.values(descriptors).map((descriptor) =>
      buildTrustedReportEvidenceHref(currentHref, descriptor, catalog)
    );
    for (const href of hrefs) {
      expect(reportEvidenceNavigationOptions(href)).toEqual({
        scroll: false
      });
      expect(reportPageLocalLinkProps(href)).toEqual({
        scroll: false,
        prefetch: false
      });
    }
    const href = buildTrustedReportEvidenceHref(
      currentHref,
      descriptors.trend,
      catalog
    );
    expect(
      reportEvidenceNavigationOptions(
        `${href}&evidenceType=${descriptors.driver.evidenceType}`
      )
    ).toBeUndefined();
    expect(
      reportPageLocalLinkProps(
        `${href}&evidenceType=${descriptors.driver.evidenceType}`
      )
    ).toEqual({ prefetch: false });
    expect(
      reportEvidenceNavigationOptions(
        `${href}&evidenceKey=${descriptors.driver.key}`
      )
    ).toBeUndefined();
    expect(
      reportPageLocalLinkProps(
        `/reports?view=overview&evidenceType=trend`
      )
    ).toEqual({ prefetch: false });
  });

  it("keeps default navigation for non-evidence, malformed, and non-app-relative links", () => {
    expect(
      reportEvidenceNavigationOptions("/reviews/conversation-1")
    ).toBeUndefined();
    expect(
      reportPageLocalLinkProps("/reviews/conversation-1")
    ).toEqual({ prefetch: false });
    expect(
      reportEvidenceNavigationOptions(
        `/reports?view=overview&evidenceType=trend&evidenceKey=invalid`
      )
    ).toBeUndefined();
    expect(
      reportEvidenceNavigationOptions(
        `https://example.com/reports?evidenceType=trend&evidenceKey=${descriptors.trend.key}`
      )
    ).toBeUndefined();
    expect(
      reportEvidenceNavigationOptions(
        `//example.com/reports?evidenceType=trend&evidenceKey=${descriptors.trend.key}`
      )
    ).toBeUndefined();
  });

  it("builds canonical opaque evidence hrefs for every trusted evidence type", () => {
    for (const descriptor of Object.values(descriptors)) {
      const href = buildTrustedReportEvidenceHref(
        currentHref,
        descriptor,
        catalog
      );
      expect(href).toContain(`evidenceType=${descriptor.evidenceType}`);
      expect(href).toContain(`evidenceKey=${descriptor.key}`);
      expect(href).not.toContain("trend=");
    }
  });

  it("immutably relinks chart points so the graph and its shared table model keep identical hrefs", () => {
    const model = {
      id: "quality",
      points: [
        { id: "point-1", label: "01.07", href: "/reviews?old=1" },
        { id: "point-2", label: "02.07", href: "/reviews?old=2" }
      ]
    };
    const href = buildTrustedReportEvidenceHref(
      currentHref,
      descriptors.trend,
      catalog
    );
    const result = relinkReportChartModel(model, {
      "point-1": href
    });

    expect(result).not.toBe(model);
    expect(result.points).not.toBe(model.points);
    expect(result.points[0].href).toBe(href);
    expect(result.points[1].href).toBe("/reviews?old=2");
    expect(model.points[0].href).toBe("/reviews?old=1");
  });

  it("immutably relinks representative driver, matrix, and KPI rows without dropping untouched hrefs", () => {
    const rows = [
      { key: "source", href: "/reviews?source=old" },
      { key: "matrix", href: "/reviews?matrix=old" },
      { key: "kpi", href: "/reviews?kpi=old" },
      { key: "untouched", href: "/reviews?keep=1" }
    ];
    const hrefs = Object.fromEntries(
      (["driver", "matrix", "kpi"] as const).map((type) => [
        type === "driver" ? "source" : type,
        buildTrustedReportEvidenceHref(currentHref, descriptors[type], catalog)
      ])
    );
    const result = relinkReportRows(rows, hrefs);

    expect(result).not.toBe(rows);
    expect(result.map((row) => row.href)).toEqual([
      hrefs.source,
      hrefs.matrix,
      hrefs.kpi,
      "/reviews?keep=1"
    ]);
    expect(rows[0].href).toBe("/reviews?source=old");
  });

  it("keeps the reports page on one global Sheet and wires all four trusted descriptor types through the immutable seams", () => {
    expect(reportsPageSource.match(/<ReportEvidenceSheet/g)).toHaveLength(1);
    expect(reportsPageSource).not.toContain(
      'reportView === "overview" && defaultTrend'
    );
    expect(reportsPageSource).toContain("relinkReportChartModel(");
    expect(reportsPageSource).toContain("relinkReportRows(");
    for (const evidenceType of ["trend", "driver", "matrix", "kpi"]) {
      expect(reportsPageSource).toContain(`evidenceType: "${evidenceType}"`);
    }
    expect(reportsPageSource).toContain('metric: "operator-block"');
    expect(reportsPageSource).toContain('metric: "high-risk"');
  });

  it("does not create a HIGH+ KPI descriptor under LOW or MEDIUM finding filters", () => {
    const baseState = {
      view: "overview" as const,
      period: "vk-current" as const,
      compare: "previous" as const,
      grain: "day" as const,
      chartView: "graph" as const,
      series: ["score" as const]
    };

    for (const risk of ["low", "medium"] as const) {
      expect(
        buildReportEvidenceDescriptorCatalog({
          workspaceId: "workspace",
          state: { ...baseState, risk },
          catalog,
          selection: {
            evidenceType: "kpi",
            metric: "high-risk"
          }
        })
      ).toEqual([]);
    }
  });

  it("keeps risk stack segments on exact risk-specific queue links", () => {
    expect(reportsPageSource).toContain(
      "const riskStackSegments = baseRiskStackSegments"
    );
    expect(reportsPageSource).not.toContain(
      "Высокий: highRiskEvidenceLink.href"
    );
    expect(reportsPageSource).not.toContain(
      "Критический: highRiskEvidenceLink.href"
    );
  });

  it("wires finding- and score-level facets through the page aggregation boundary", () => {
    expect(reportsPageSource).toContain("reportAnalysisScoreForReview(");
    expect(reportsPageSource).toContain("scoredFinalizedReviews");
    expect(reportsPageSource).toContain("reportFindingMatchesAnalysis(");
    expect(reportsPageSource).toContain(
      "const comparisonPeriod = resolveReportComparisonPeriod("
    );
    expect(reportsPageSource).toContain(
      'CardTitle>Недоступна для активного среза</CardTitle>'
    );
    expect(reportsPageSource).toContain(
      "hasEntityFilters ? [] : quotaProgressRows"
    );
    expect(reportsPageSource).toContain(
      "const agreementEvidenceLinks: Map<"
    );
    expect(reportsPageSource).toContain(
      "hasEntityFilters\n      ? []"
    );
    expect(reportsPageSource).toContain(
      'hasEntityFilters || analysisState.evidenceType === "matrix"'
    );
    expect(reportsPageSource).toContain(
      "Нормы проверок недоступны"
    );
    expect(reportsPageSource).toContain(
      'value: hasEntityFilters ? "—" : String(quotas.length)'
    );
  });
});
