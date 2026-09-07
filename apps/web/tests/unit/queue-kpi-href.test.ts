import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analystMineOverdueHref, queueFilterResetHref } from "@/lib/auth/role-home";
import { EMPTY_TRIAGE_IMPOSTOR_HREF } from "@/lib/dashboard/empty-triage";
import {
  opsQueueKpiHref,
  opsQueueKpiMetricHref,
  OVERDUE_SLA_HREF,
  QUEUED_STATUS_HREF
} from "@/lib/dashboard/queue-kpi-href";

const srcRoot = join(process.cwd(), "src");

const primaryKpiSources = [
  "app/dashboard/page.tsx",
  "components/dashboard/exec-risk-home.tsx",
  "components/dashboard/exec-risk-chart.client.tsx",
  "lib/dashboard/exec-risk-home.ts",
  "lib/dashboard/queue-kpi-href.ts",
  "lib/reviewer-workload.ts"
];

describe("opsQueueKpiHref", () => {
  it("drills overdue SLA through the due filter, not an unreviewed dump", () => {
    expect(
      opsQueueKpiHref({
        overdueReviewCount: 3,
        queuedCount: 8,
        role: "TEAM_LEAD"
      })
    ).toBe(OVERDUE_SLA_HREF);
    expect(OVERDUE_SLA_HREF).toBe("/reviews?due=overdue");
  });

  it("drills unstarted queue through qaStatus=QUEUED — same as exec / pulse", () => {
    expect(
      opsQueueKpiHref({
        overdueReviewCount: 0,
        queuedCount: 4,
        role: "ADMIN"
      })
    ).toBe(QUEUED_STATUS_HREF);
    expect(QUEUED_STATUS_HREF).toBe("/reviews?qaStatus=QUEUED");
  });

  it("sends a zero KPI to role-home / unfiltered queue, never the impostor", () => {
    expect(
      opsQueueKpiHref({
        overdueReviewCount: 0,
        queuedCount: 0,
        role: "QA_ANALYST",
        name: "Анна QA"
      })
    ).toBe(analystMineOverdueHref("Анна QA"));
    expect(
      opsQueueKpiHref({
        overdueReviewCount: 0,
        queuedCount: 0,
        role: "TEAM_LEAD"
      })
    ).toBe(queueFilterResetHref("TEAM_LEAD"));
    expect(
      opsQueueKpiHref({
        overdueReviewCount: 0,
        queuedCount: 0,
        role: "ADMIN"
      })
    ).toBe("/reviews");

    for (const role of ["ADMIN", "TEAM_LEAD", "QA_ANALYST", "EXEC"] as const) {
      expect(
        opsQueueKpiHref({ overdueReviewCount: 0, queuedCount: 0, role, name: "Анна QA" })
      ).not.toBe(EMPTY_TRIAGE_IMPOSTOR_HREF);
    }
  });
});

describe("opsQueueKpiMetricHref", () => {
  it("matches opsQueueKpiHref for the winning overdue / queued / zero cases", () => {
    const overdueInput = {
      overdueReviewCount: 3,
      queuedCount: 8,
      role: "EXEC" as const
    };
    expect(opsQueueKpiMetricHref("overdue", overdueInput)).toBe(opsQueueKpiHref(overdueInput));
    expect(opsQueueKpiMetricHref("overdue", overdueInput)).toBe(OVERDUE_SLA_HREF);

    const queuedInput = {
      overdueReviewCount: 0,
      queuedCount: 4,
      role: "ADMIN" as const
    };
    expect(opsQueueKpiMetricHref("queued", queuedInput)).toBe(opsQueueKpiHref(queuedInput));
    expect(opsQueueKpiMetricHref("queued", queuedInput)).toBe(QUEUED_STATUS_HREF);

    const zeroInput = {
      overdueReviewCount: 0,
      queuedCount: 0,
      role: "EXEC" as const
    };
    expect(opsQueueKpiMetricHref("overdue", zeroInput)).toBe(opsQueueKpiHref(zeroInput));
    expect(opsQueueKpiMetricHref("queued", zeroInput)).toBe(opsQueueKpiHref(zeroInput));
    expect(opsQueueKpiMetricHref("overdue", zeroInput)).toBe("/reviews");
    expect(opsQueueKpiMetricHref("overdue", zeroInput)).not.toBe(EMPTY_TRIAGE_IMPOSTOR_HREF);
  });
});

describe("primary KPI / fallback hrefs", () => {
  it("does not hardcode the status=unreviewed impostor on dashboard or workload drills", () => {
    expect(EMPTY_TRIAGE_IMPOSTOR_HREF).toBe("/reviews?status=unreviewed");

    for (const relative of primaryKpiSources) {
      const source = readFileSync(join(srcRoot, relative), "utf8");
      expect(source, relative).not.toContain(EMPTY_TRIAGE_IMPOSTOR_HREF);
      expect(source, relative).not.toContain("status=unreviewed");
    }
  });

  it("wires ops KPI cards through opsQueueKpiHref", () => {
    const dashboardPage = readFileSync(join(srcRoot, "app/dashboard/page.tsx"), "utf8");
    expect(dashboardPage).toContain("opsQueueKpiHref");
    expect(dashboardPage).toContain("href={queueKpiHref}");
    expect(dashboardPage.match(/href=\{queueKpiHref\}/g)?.length).toBe(2);
  });
});
