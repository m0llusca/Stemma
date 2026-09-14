import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: mocks.queryRaw
  }
}));

describe("loadReportPeriodKpis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps SQL aggregates into KPI numbers", async () => {
    mocks.queryRaw.mockResolvedValue([
      {
        finalized_count: 12n,
        average_score: 87.5,
        critical_count: 2n,
        reanswer_count: 1n
      }
    ]);

    const { loadReportPeriodKpis } = await import("@/lib/reports/report-period-kpis");
    const kpis = await loadReportPeriodKpis("workspace-1", {
      preset: "custom",
      label: "Период",
      start: new Date("2026-01-01T00:00:00.000Z"),
      end: new Date("2026-01-31T23:59:59.999Z")
    });

    expect(kpis).toEqual({
      finalizedCount: 12,
      averageScore: 87.5,
      criticalCount: 2,
      reanswerCount: 1
    });
  });
});
