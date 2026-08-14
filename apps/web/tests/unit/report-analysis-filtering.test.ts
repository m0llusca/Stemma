import { describe, expect, it } from "vitest";
import {
  reportAnalysisScoreForReview,
  buildReportAnalysisReviewWhere,
  reportFindingMatchesAnalysis,
  reportScoreMatchesAnalysis,
  reportReviewMatchesAnalysis,
  resolveReportComparisonPeriod
} from "@/lib/reports/report-analysis-filtering";
import type {
  ReportAnalysisState,
  ReportFilterCatalog
} from "@/lib/reports/report-analysis-state";
import type { ReportPeriod } from "@/lib/report-period";

const catalog: ReportFilterCatalog = {
  teams: [{ slug: "declining-team-0123456789", value: "2ЛП — снижение" }],
  sources: ["freshdesk"],
  blocks: [{ slug: "processes-aabbccddee", value: "Процессы" }]
};
const state: ReportAnalysisState = {
  view: "performance",
  period: "custom",
  start: "2026-07-01",
  end: "2026-07-31",
  compare: "previous",
  grain: "week",
  team: "declining-team-0123456789",
  source: "freshdesk",
  risk: "high_plus",
  block: "processes-aabbccddee",
  chartView: "graph",
  series: ["score", "volume"]
};

describe("report analysis filtering boundary", () => {
  it("maps authenticated slugs into one Prisma-safe review predicate", () => {
    expect(buildReportAnalysisReviewWhere(state, catalog)).toEqual({
      conversation: {
        is: {
          teamName: "2ЛП — снижение",
          externalSource: "freshdesk"
        }
      },
      scores: {
        some: {
          criterion: {
            block: "Процессы"
          }
        }
      },
      findings: {
        some: {
          riskLevel: {
            in: ["HIGH", "CRITICAL"]
          }
        }
      }
    });
  });

  it("applies the same source, team, block, and HIGH+ semantics to loaded rows", () => {
    const matching = {
      conversation: {
        teamName: "2ЛП — снижение",
        externalSource: "freshdesk"
      },
      scores: [{ criterion: { block: "Процессы" } }],
      findings: [{ riskLevel: "CRITICAL" }]
    };

    expect(reportReviewMatchesAnalysis(matching, state, catalog)).toBe(true);
    expect(
      reportReviewMatchesAnalysis(
        {
          ...matching,
          conversation: {
            ...matching.conversation,
            externalSource: "otrs"
          }
        },
        state,
        catalog
      )
    ).toBe(false);
    expect(
      reportReviewMatchesAnalysis(
        { ...matching, findings: [{ riskLevel: "MEDIUM" }] },
        state,
        catalog
      )
    ).toBe(false);
  });

  it("keeps risk finding-level when one review contains LOW and CRITICAL findings", () => {
    const lowState: ReportAnalysisState = {
      ...state,
      risk: "low"
    };
    const mixedRiskReview = {
      conversation: {
        teamName: "2ЛП — снижение",
        externalSource: "freshdesk"
      },
      scores: [{ criterion: { block: "Процессы" } }],
      findings: [
        { riskLevel: "LOW" },
        { riskLevel: "CRITICAL" }
      ]
    };

    expect(
      reportReviewMatchesAnalysis(mixedRiskReview, lowState, catalog)
    ).toBe(true);
    expect(
      mixedRiskReview.findings.filter((finding) =>
        reportFindingMatchesAnalysis(finding, lowState)
      )
    ).toEqual([{ riskLevel: "LOW" }]);
  });

  it("uses only selected-block criterion scores for a mixed-block review", () => {
    const mixedBlockReview = {
      totalScore: 42,
      scores: [
        {
          value: 3,
          passed: null,
          isNotApplicable: false,
          criterion: {
            block: "Процессы",
            kind: "SCALE_1_3",
            weight: 2
          }
        },
        {
          value: 1,
          passed: null,
          isNotApplicable: false,
          criterion: {
            block: "Продажи",
            kind: "SCALE_1_3",
            weight: 8
          }
        }
      ]
    };

    expect(
      reportAnalysisScoreForReview(mixedBlockReview, state, catalog)
    ).toBe(100);
    expect(
      mixedBlockReview.scores.filter((score) =>
        reportScoreMatchesAnalysis(score, state, catalog)
      )
    ).toEqual([mixedBlockReview.scores[0]]);
  });

  it("returns no analytical score for a selected block with only N/A or zero-weight scores", () => {
    expect(
      reportAnalysisScoreForReview(
        {
          totalScore: 88,
          scores: [
            {
              value: 3,
              passed: null,
              isNotApplicable: true,
              criterion: {
                block: "Процессы",
                kind: "SCALE_1_3",
                weight: 100
              }
            },
            {
              value: 3,
              passed: null,
              isNotApplicable: false,
              criterion: {
                block: "Процессы",
                kind: "SCALE_1_3",
                weight: 0
              }
            }
          ]
        },
        state,
        catalog
      )
    ).toBeNull();
  });

  it("resolves adjacent, year-over-year, and disabled comparison periods without silently substituting one another", () => {
    const period: ReportPeriod = {
      preset: "custom",
      start: new Date("2024-02-29T00:00:00.000Z"),
      end: new Date("2024-03-31T23:59:59.999Z"),
      label: "Произвольный период"
    };

    expect(resolveReportComparisonPeriod(period, "previous")).toMatchObject({
      start: new Date("2024-01-28T00:00:00.000Z"),
      end: new Date("2024-02-28T23:59:59.999Z")
    });
    expect(resolveReportComparisonPeriod(period, "year")).toMatchObject({
      preset: "year",
      start: new Date("2023-02-28T00:00:00.000Z"),
      end: new Date("2023-03-31T23:59:59.999Z")
    });
    expect(resolveReportComparisonPeriod(period, "none")).toBeNull();
  });
});
