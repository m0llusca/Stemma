import { describe, expect, it } from "vitest";
import { buildExecRiskNarrative } from "@/lib/dashboard/exec-risk-home";

const hrefs = {
  overdue: "/reviews?due=overdue",
  highRisk: "/reviews?status=reviewed&riskLevel=HIGH_OR_CRITICAL",
  queued: "/reviews?qaStatus=QUEUED"
};

describe("buildExecRiskNarrative", () => {
  it("leads with overdue SLA and drills to the overdue queue", () => {
    expect(
      buildExecRiskNarrative({ overdueReviewCount: 4, highRiskCount: 2, queuedCount: 9 }, hrefs)
    ).toMatchObject({
      title: "Просрочено SLA: 4",
      primaryHref: hrefs.overdue,
      tone: "danger",
      actionLabel: "Разобрать"
    });
  });

  it("falls through to high risk, then unstarted queue, then an all-clear", () => {
    expect(
      buildExecRiskNarrative({ overdueReviewCount: 0, highRiskCount: 3, queuedCount: 1 }, hrefs)
        .primaryHref
    ).toBe(hrefs.highRisk);
    expect(
      buildExecRiskNarrative({ overdueReviewCount: 0, highRiskCount: 0, queuedCount: 5 }, hrefs)
    ).toMatchObject({
      primaryHref: hrefs.queued,
      tone: "warning"
    });
    expect(
      buildExecRiskNarrative({ overdueReviewCount: 0, highRiskCount: 0, queuedCount: 0 }, hrefs)
    ).toMatchObject({
      title: "Критичных отклонений нет",
      primaryHref: hrefs.queued,
      tone: "success"
    });
  });
});
