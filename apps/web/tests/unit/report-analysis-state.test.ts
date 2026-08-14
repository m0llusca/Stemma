import { describe, expect, it } from "vitest";
import {
  buildReportAnalysisHref,
  canonicalizeReportAnalysisHref,
  parseReportAnalysisState,
  reportNavigationLinkProps,
  reportPresentationLinkProps,
  serializeReportAnalysisState
} from "@/lib/reports/report-analysis-state";

const catalog = {
  teams: [{ slug: "declining-team-0123456789", value: "2ЛП — снижение" }],
  blocks: [{ slug: "processes-aabbccddee", value: "Процессы" }],
  sources: ["freshdesk", "otrs", "custom_api"]
};

describe("report analysis URL state", () => {
  it("parses every allowlisted key and serializes one canonical application-relative href", () => {
    const state = parseReportAnalysisState(
      {
        view: "performance",
        period: "custom",
        start: "2026-07-01",
        end: "2026-07-24",
        compare: "previous",
        grain: "week",
        team: "declining-team-0123456789",
        source: "freshdesk",
        risk: "high_plus",
        block: "processes-aabbccddee",
        section: "ai-drift",
        chartView: "table",
        series: "volume,score,target,previous",
        evidenceType: "trend",
        evidenceKey: "ev1_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
      },
      catalog
    );

    expect(state).toEqual({
      view: "performance",
      period: "custom",
      start: "2026-07-01",
      end: "2026-07-24",
      compare: "previous",
      grain: "week",
      team: "declining-team-0123456789",
      source: "freshdesk",
      risk: "high_plus",
      block: "processes-aabbccddee",
      section: "ai-drift",
      chartView: "table",
      series: ["score", "volume", "previous", "target"],
      evidenceType: "trend",
      evidenceKey: "ev1_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    });
    expect(serializeReportAnalysisState(state)).toBe(
      "/reports?view=performance&period=custom&start=2026-07-01&end=2026-07-24&compare=previous&grain=week&team=declining-team-0123456789&source=freshdesk&risk=high_plus&block=processes-aabbccddee&section=ai-drift&chartView=table&series=score%2Cvolume%2Cprevious%2Ctarget&evidenceType=trend&evidenceKey=ev1_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    );
  });

  it("rejects unknown filter slugs, malformed evidence pairs, duplicate values, and unsupported singleton values", () => {
    const state = parseReportAnalysisState(
      {
        view: ["process", "details"],
        period: ["custom", "vk-current"],
        start: "not-a-date",
        end: "2026-07-24",
        compare: "future",
        grain: "month",
        team: "2ЛП — снижение",
        source: "foreign_source",
        risk: "severe",
        block: "stale-block",
        section: "unknown",
        chartView: "cards",
        series: "score,unknown",
        evidenceType: "trend",
        evidenceKey: "../../secret",
        ignored: "must-not-survive"
      },
      catalog
    );

    expect(state).toEqual({
      view: "overview",
      period: "vk-current",
      compare: "previous",
      grain: "day",
      chartView: "graph",
      series: ["score", "volume", "previous", "target"]
    });
    expect(serializeReportAnalysisState(state)).toBe(
      "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score%2Cvolume%2Cprevious%2Ctarget"
    );
  });

  it("clamps custom ranges to 366 inclusive days and migrates legacy trend without re-emitting it", () => {
    expect(
      serializeReportAnalysisState(
        parseReportAnalysisState(
          {
            view: "overview",
            period: "custom",
            start: "2025-01-01",
            end: "2026-07-24",
            trend: "month"
          },
          catalog
        )
      )
    ).toBe(
      "/reports?view=overview&period=custom&start=2025-01-01&end=2026-01-01&compare=previous&grain=week&chartView=graph&series=score%2Cvolume%2Cprevious%2Ctarget"
    );
    expect(
      parseReportAnalysisState(
        { period: "vk-current", trend: "week", grain: "day" },
        catalog
      ).grain
    ).toBe("day");
  });

  it("removes sections incompatible with the active view and restores a non-empty series default", () => {
    expect(
      parseReportAnalysisState(
        {
          view: "process",
          section: "ai-drift",
          series: ""
        },
        catalog
      )
    ).toMatchObject({
      view: "process",
      series: ["score", "volume", "previous", "target"]
    });
    expect(
      parseReportAnalysisState(
        {
          view: "performance",
          section: "ai-drift",
          series: "score,score"
        },
        catalog
      )
    ).toMatchObject({
      section: "ai-drift",
      series: ["score", "volume", "previous", "target"]
    });
  });

  it("accepts exact catalogued integration keys that use underscores", () => {
    expect(
      parseReportAnalysisState(
        {
          view: "performance",
          source: "custom_api"
        },
        catalog
      ).source
    ).toBe("custom_api");
  });

  it("fails closed for cross-origin and non-report hrefs", () => {
    const safe =
      "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score%2Cvolume%2Cprevious%2Ctarget";

    expect(
      canonicalizeReportAnalysisHref("https://evil.example/reports?risk=high_plus", catalog)
    ).toBe(safe);
    expect(canonicalizeReportAnalysisHref("/admin?view=overview", catalog)).toBe(safe);
    expect(canonicalizeReportAnalysisHref("//evil.example/reports", catalog)).toBe(safe);
    expect(
      canonicalizeReportAnalysisHref(
        "/reports?view=overview&view=process&period=vk-current",
        catalog
      )
    ).toBe(safe);
  });

  it("uses replace-compatible hrefs for presentation state and push-compatible hrefs for filters and evidence", () => {
    const current =
      "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score%2Cvolume";

    expect(
      reportPresentationLinkProps(current, {
        chartView: "table",
        series: ["score"]
      })
    ).toEqual({
      href:
        "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=table&series=score",
      replace: true
    });
    expect(
      reportNavigationLinkProps(current, {
        risk: "high_plus",
        evidenceType: "kpi",
        evidenceKey: "ev1_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"
      })
    ).toEqual({
      href:
      "/reports?view=overview&period=vk-current&compare=previous&grain=day&risk=high_plus&chartView=graph&series=score%2Cvolume&evidenceType=kpi&evidenceKey=ev1_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      replace: false
    });
  });

  it("drops only evidence when closing and resets incompatible evidence when a filter changes", () => {
    const current =
      "/reports?view=overview&period=vk-current&compare=previous&grain=day&team=declining-team-0123456789&chartView=graph&series=score&evidenceType=driver&evidenceKey=ev1_CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";

    expect(
      buildReportAnalysisHref(current, {
        evidenceType: null,
        evidenceKey: null
      }, catalog)
    ).toBe(
      "/reports?view=overview&period=vk-current&compare=previous&grain=day&team=declining-team-0123456789&chartView=graph&series=score"
    );
    expect(buildReportAnalysisHref(current, { risk: "high_plus" }, catalog)).toBe(
      "/reports?view=overview&period=vk-current&compare=previous&grain=day&team=declining-team-0123456789&risk=high_plus&chartView=graph&series=score"
    );
  });

  it("clears evidence for view/filter changes while presentation changes preserve it", () => {
    const current =
      "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score&evidenceType=trend&evidenceKey=ev1_DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD";

    expect(buildReportAnalysisHref(current, { view: "performance" })).toBe(
      "/reports?view=performance&period=vk-current&compare=previous&grain=day&chartView=graph&series=score"
    );
    expect(buildReportAnalysisHref(current, { chartView: "table" })).toBe(
      "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=table&series=score&evidenceType=trend&evidenceKey=ev1_DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD"
    );

    const performance =
      "/reports?view=performance&period=vk-current&compare=previous&grain=week&section=ai-drift&chartView=graph&series=score";
    expect(buildReportAnalysisHref(performance, { view: "process" })).toBe(
      "/reports?view=process&period=vk-current&compare=previous&grain=week&chartView=graph&series=score"
    );
    expect(buildReportAnalysisHref(performance, { series: [] })).toBe(
      "/reports?view=performance&period=vk-current&compare=previous&grain=week&section=ai-drift&chartView=graph&series=score%2Cvolume%2Cprevious%2Ctarget"
    );
  });

  it("never blesses syntactically valid stale team or block slugs while patching", () => {
    expect(
      buildReportAnalysisHref(
        "/reports?view=overview&period=vk-current&team=foreign-team-9988776655&block=foreign-block-9988776655",
        { risk: "high_plus" },
        catalog
      )
    ).toBe(
      "/reports?view=overview&period=vk-current&compare=previous&grain=day&risk=high_plus&chartView=graph&series=score%2Cvolume%2Cprevious%2Ctarget"
    );
  });
});
