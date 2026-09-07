import { describe, expect, it } from "vitest";
import { queueFilterResetHref } from "@/lib/auth/role-home";
import { EMPTY_TRIAGE_IMPOSTOR_HREF } from "@/lib/dashboard/empty-triage";
import {
  buildExecRiskChartModel,
  buildExecRiskNarrative,
  execRiskChartBarHref
} from "@/lib/dashboard/exec-risk-home";
import { opsQueueKpiHref } from "@/lib/dashboard/queue-kpi-href";

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

  it("falls through to high risk, then unstarted queue, then an honest empty", () => {
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
      buildExecRiskNarrative({ overdueReviewCount: 0, highRiskCount: 0, queuedCount: 0 }, hrefs, {
        role: "EXEC"
      })
    ).toMatchObject({
      title: "Нет сигналов за период",
      primaryHref: queueFilterResetHref("EXEC"),
      tone: "accent"
    });
  });

  it("locks all-zero TriageStrip primary to the same reset as the chart EmptyState", () => {
    const zero = { overdueReviewCount: 0, highRiskCount: 0, queuedCount: 0 };
    const role = "EXEC" as const;
    const narrative = buildExecRiskNarrative(zero, hrefs, { role });
    const chart = buildExecRiskChartModel({ signal: zero, hrefs, role });

    expect(chart.empty).toBe(true);
    if (!chart.empty) {
      throw new Error("expected an empty chart model");
    }

    expect(narrative.primaryHref).toBe(chart.resetHref);
    expect(narrative.primaryHref).toBe(queueFilterResetHref(role));
    expect(narrative.primaryHref).toBe(
      opsQueueKpiHref({ overdueReviewCount: 0, queuedCount: 0, role })
    );
    expect(narrative.primaryHref).toBe("/reviews");
    expect(narrative.primaryHref).not.toBe(hrefs.queued);
    expect(narrative.primaryHref).not.toBe(EMPTY_TRIAGE_IMPOSTOR_HREF);
  });
});

describe("execRiskChartBarHref", () => {
  const role = "EXEC" as const;

  it("locks overdue / queued clicks to the opsQueueKpiHref contract", () => {
    const overdueSignal = { overdueReviewCount: 6, highRiskCount: 3, queuedCount: 11 };
    expect(execRiskChartBarHref("overdue", { signal: overdueSignal, hrefs, role })).toBe(
      opsQueueKpiHref({ ...overdueSignal, role })
    );
    expect(execRiskChartBarHref("overdue", { signal: overdueSignal, hrefs, role })).toBe(hrefs.overdue);

    const queuedOnly = { overdueReviewCount: 0, highRiskCount: 0, queuedCount: 5 };
    expect(execRiskChartBarHref("queued", { signal: queuedOnly, hrefs, role })).toBe(
      opsQueueKpiHref({ ...queuedOnly, role })
    );
    expect(execRiskChartBarHref("queued", { signal: queuedOnly, hrefs, role })).toBe(hrefs.queued);
  });

  it("sends a zero bar to the role-home reset, never the unreviewed impostor", () => {
    const zero = { overdueReviewCount: 0, highRiskCount: 0, queuedCount: 0 };
    const reset = queueFilterResetHref(role);

    expect(execRiskChartBarHref("overdue", { signal: zero, hrefs, role })).toBe(
      opsQueueKpiHref({ ...zero, role })
    );
    expect(execRiskChartBarHref("queued", { signal: zero, hrefs, role })).toBe(reset);
    expect(execRiskChartBarHref("highRisk", { signal: zero, hrefs, role })).toBe(reset);
    expect(reset).toBe("/reviews");
    expect(reset).not.toBe(EMPTY_TRIAGE_IMPOSTOR_HREF);
  });

  it("keeps a live high-risk bar on the same 30-day findings href as the KPI tile", () => {
    const signal = { overdueReviewCount: 0, highRiskCount: 3, queuedCount: 1 };
    expect(execRiskChartBarHref("highRisk", { signal, hrefs, role })).toBe(hrefs.highRisk);
  });
});

describe("buildExecRiskChartModel", () => {
  it("returns an honest empty instead of a fake-green series", () => {
    const model = buildExecRiskChartModel({
      signal: { overdueReviewCount: 0, highRiskCount: 0, queuedCount: 0 },
      hrefs,
      role: "EXEC"
    });

    expect(model).toEqual({ empty: true, resetHref: "/reviews" });
  });

  it("builds three drill bars that reuse the KPI href contract", () => {
    const signal = { overdueReviewCount: 6, highRiskCount: 3, queuedCount: 11 };
    const model = buildExecRiskChartModel({ signal, hrefs, role: "EXEC" });

    expect(model.empty).toBe(false);
    if (model.empty) {
      throw new Error("expected a live chart model");
    }

    expect(model.bars.map((bar) => [bar.key, bar.value, bar.href])).toEqual([
      ["overdue", 6, hrefs.overdue],
      ["highRisk", 3, hrefs.highRisk],
      ["queued", 11, hrefs.queued]
    ]);
    expect(model.bars.some((bar) => bar.tone === "neutral" && bar.value > 0)).toBe(false);
  });
});
