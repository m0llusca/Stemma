import { describe, expect, it } from "vitest";
import {
  parseReportAnalysisState,
  serializeReportAnalysisState,
  type ReportFilterCatalog
} from "@/lib/reports/report-analysis-state";
import { buildReportFilterCatalog } from "@/lib/reports/report-filter-catalog";
import { buildReportCatalogSlug } from "@/lib/reports/report-filter-slug";
import { safeReportsHref } from "@/lib/saved-report-view";

const catalog: ReportFilterCatalog = {
  teams: [
    {
      slug: "declining-team-0123456789",
      value: "2ЛП — снижение"
    }
  ],
  sources: ["freshdesk"],
  blocks: [
    {
      slug: "processes-aabbccddee",
      value: "Процессы"
    }
  ]
};

describe("saved report view canonicalization", () => {
  it("builds stable human-readable catalog slugs with collision-resistant SHA-256 suffixes", () => {
    expect(buildReportCatalogSlug("2ЛП — снижение")).toBe(
      "2lp-snizhenie-909485c95ea4"
    );
    expect(buildReportCatalogSlug("Процессы")).toBe(
      "protsessy-115c88c9a245"
    );
    const first = buildReportFilterCatalog({
      teams: ["Команда-A", "2ЛП — снижение", "Команда А"],
      sources: ["freshdesk"],
      blocks: ["Процессы"]
    });
    const second = buildReportFilterCatalog({
      teams: ["Команда А", "Команда-A", "2ЛП — снижение"],
      sources: ["freshdesk"],
      blocks: ["Процессы"]
    });

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      teams: expect.arrayContaining([
        {
          slug: "2lp-snizhenie-909485c95ea4",
          value: "2ЛП — снижение"
        }
      ]),
      sources: ["freshdesk"],
      blocks: [
        {
          slug: "protsessy-115c88c9a245",
          value: "Процессы"
        }
      ]
    });
    const collidingPrefixes = first.teams.filter((item) =>
      item.slug.startsWith("komanda-a-")
    );
    expect(collidingPrefixes).toHaveLength(2);
    expect(new Set(collidingPrefixes.map((item) => item.slug)).size).toBe(2);
  });

  it("round-trips realistic HIGH+, Freshdesk/Processes, declining-team, and AI-drift views through the one parser", () => {
    const hrefs = [
      "/reports?view=overview&period=vk-current&compare=previous&grain=day&risk=high_plus&chartView=graph&series=score%2Cvolume",
      "/reports?view=performance&period=vk-current&compare=previous&grain=week&source=freshdesk&block=processes-aabbccddee&section=drivers&chartView=table&series=score",
      "/reports?view=overview&period=calendar-current&compare=year&grain=week&team=declining-team-0123456789&section=drivers&chartView=graph&series=score%2Cprevious",
      "/reports?view=performance&period=quarter-current&compare=previous&grain=week&section=ai-drift&chartView=graph&series=score%2Cvolume%2Cprevious%2Ctarget"
    ];

    for (const href of hrefs) {
      const params = Object.fromEntries(new URL(href, "https://qc.local").searchParams);
      expect(
        serializeReportAnalysisState(parseReportAnalysisState(params, catalog))
      ).toBe(href);
      expect(safeReportsHref(href, catalog)).toBe(href);
    }
  });

  it("migrates legacy trend, strips evidence, and removes stale workspace slugs", () => {
    expect(
      safeReportsHref(
        "/reports?view=performance&period=vk-current&trend=month&team=foreign-9988776655&source=freshdesk&block=stale-9988776655&section=ai-drift&chartView=graph&series=score%2Cvolume&evidenceType=trend&evidenceKey=ev1_foreign",
        catalog
      )
    ).toBe(
      "/reports?view=performance&period=vk-current&compare=previous&grain=week&source=freshdesk&section=ai-drift&chartView=graph&series=score%2Cvolume"
    );
  });

  it("fails closed to a canonical reports state for cross-origin and non-report values", () => {
    const safe =
      "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score%2Cvolume%2Cprevious%2Ctarget";

    expect(safeReportsHref("https://evil.example/reports?risk=high_plus", catalog)).toBe(safe);
    expect(safeReportsHref("/admin?view=overview", catalog)).toBe(safe);
    expect(safeReportsHref("//evil.example/reports", catalog)).toBe(safe);
  });
});
