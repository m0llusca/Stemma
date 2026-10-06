import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadReportFilterCatalog: vi.fn(),
  prisma: {
    criterionScore: { findMany: vi.fn() },
    review: {
      findMany: vi.fn()
    }
  }
}));

vi.mock("@/lib/reports/report-filter-catalog", () => ({ loadReportFilterCatalog: mocks.loadReportFilterCatalog }));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

// One finalized review row as it now arrives from the narrow `select`. The
// fields here are exactly the ones the CSV/XLSX/PDF rows read — nothing else.
const reviewRow = {
  id: "review-1",
  _count: { findings: 0 },
  finalizedAt: new Date("2026-05-02T09:00:00.000Z"),
  totalScore: 94,
  criticalError: false,
  criticalCategory: null,
  needsReanswer: false,
  reanswerStatus: "not_needed",
  appealStatus: "none",
  summary: "Ответ корректный; следующий шаг понятен.",
  reviewer: { name: "Проверяющий" },
  conversation: {
    externalSource: "otrs_family",
    externalId: "OTRS-2451",
    subject: "Консультация по статусу заявления",
    customerName: "Анна Смирнова",
    assigneeName: "Ольга Иванова",
    supportLine: "1ЛП",
    csatScore: 5,
    csatBucket: "POSITIVE"
  },
  findings: [
    { category: "Полнота решения", riskLevel: "LOW" }
  ]
};

describe("loadReportExportRows narrow select", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadReportFilterCatalog.mockResolvedValue({
      teams: [{ slug: "team-a", value: "Команда А" }], sources: ["otrs_family"],
      blocks: [{ slug: "solution", value: "Решение" }]
    });
  });

  it("requests only the columns the export rows consume (select, not include)", async () => {
    mocks.prisma.review.findMany.mockResolvedValue([]);

    const { loadReportExportRows } = await import("@/lib/report-export");
    await loadReportExportRows("workspace-1", { period: "last-30-days" });

    const call = mocks.prisma.review.findMany.mock.calls[0][0];

    // No whole-row include is allowed — that was the performance regression.
    expect(call.include).toBeUndefined();
    expect(call.select).toEqual({
      id: true,
      finalizedAt: true,
      totalScore: true,
      criticalError: true,
      criticalCategory: true,
      needsReanswer: true,
      reanswerStatus: true,
      appealStatus: true,
      summary: true,
      _count: { select: { findings: { where: { riskLevel: { in: ["HIGH", "CRITICAL"] } } } } },
      reviewer: { select: { name: true } },
      conversation: {
        select: {
          externalSource: true,
          externalId: true,
          subject: true,
          customerName: true,
          assigneeName: true,
          supportLine: true,
          csatScore: true,
          csatBucket: true
        }
      },
      findings: {
        select: { category: true, riskLevel: true },
        orderBy: { createdAt: "asc" },
        take: 1
      }
    });
    // Filter and ordering are preserved.
    expect(call.where).toMatchObject({
      workspaceId: "workspace-1",
      status: "FINALIZED",
      reviewSource: "HUMAN"
    });
    expect(call.orderBy).toEqual({ finalizedAt: "desc" });
  });

  it("applies known conversation filters from export query params", async () => {
    mocks.prisma.review.findMany.mockResolvedValue([]);

    const { loadReportExportRows } = await import("@/lib/report-export");
    await loadReportExportRows("workspace-1", {
      period: "last-30-days",
      supportLine: "L1",
      assigneeName: "Ольга Иванова",
      unknownKey: "ignore-me"
    });

    const call = mocks.prisma.review.findMany.mock.calls[0][0];
    expect(call.where.AND[0].conversation).toEqual({
      supportLine: "L1",
      assigneeName: "Ольга Иванова"
    });
    expect(call.where.AND[0].conversation.unknownKey).toBeUndefined();
  });

  it("produces the same export row the whole-row include produced", async () => {
    mocks.prisma.review.findMany.mockResolvedValue([reviewRow]);

    const { loadReportExportRows } = await import("@/lib/report-export");
    const { rows } = await loadReportExportRows("workspace-1", { period: "last-30-days" });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual([
      reviewRow.finalizedAt.toLocaleString("ru-RU"),
      "94 балла",
      "Нет",
      "Нет",
      "none",
      "otrs_family",
      "OTRS-2451",
      "Консультация по статусу заявления",
      "Анна Смирнова",
      "Ольга Иванова",
      "Проверяющий",
      "1ЛП",
      "5",
      "Полнота решения",
      "LOW",
      "Ответ корректный; следующий шаг понятен."
    ]);
  });

  it("preserves team/source/risk filters and calculates the selected block's score", async () => {
    mocks.prisma.review.findMany.mockResolvedValue([{ ...reviewRow, _count: { findings: 1 }, findings: [{ category: "Высокий риск", riskLevel: "HIGH" }] }]);
    mocks.prisma.criterionScore.findMany.mockResolvedValue([
      { reviewId: "review-1", value: 3, passed: null, isNotApplicable: false, criterion: { block: "Решение", kind: "SCALE_1_3", weight: 50 } }
    ]);
    const { loadReportExportRows } = await import("@/lib/report-export");
    const result = await loadReportExportRows("workspace-1", {
      team: "team-a", source: "otrs_family", risk: "high_plus", block: "solution", supportLine: "L1"
    });
    expect(mocks.prisma.review.findMany.mock.calls[0][0].where).toMatchObject({
      reviewSource: "HUMAN", conversation: { is: { teamName: "Команда А", externalSource: "otrs_family" } },
      scores: { some: { criterion: { block: "Решение" } } },
      findings: { some: { riskLevel: { in: ["HIGH", "CRITICAL"] } } },
      AND: [{ conversation: { supportLine: "L1" } }]
    });
    expect(result.rows[0][1]).toBe("100 баллов");
    expect(result.metrics.averageScore).toBe(100);
    expect(result.metrics.highRiskCount).toBe(1);
    expect(result.rows[0][14]).toBe("HIGH");
    expect(mocks.prisma.review.findMany.mock.calls[0][0].select.findings.where).toEqual({ riskLevel: { in: ["HIGH", "CRITICAL"] } });
  });

  it("keeps an all-N/A block review in the row count without averaging it as zero", async () => {
    mocks.prisma.review.findMany.mockResolvedValue([reviewRow, { ...reviewRow, id: "review-na" }]);
    mocks.prisma.criterionScore.findMany.mockResolvedValue([
      { reviewId: "review-1", value: 3, passed: null, isNotApplicable: false, criterion: { block: "Решение", kind: "SCALE_1_3", weight: 100 } },
      { reviewId: "review-na", value: null, passed: null, isNotApplicable: true, criterion: { block: "Решение", kind: "SCALE_1_3", weight: 100 } }
    ]);
    const { loadReportExportRows } = await import("@/lib/report-export");
    const result = await loadReportExportRows("workspace-1", { block: "solution" });
    expect(result.rows).toHaveLength(2);
    expect(result.rows[1][1]).toBe("Нет данных");
    expect(result.metrics).toMatchObject({ finalizedCount: 2, averageScore: 100 });
  });

  it("refuses to widen an export with a removed catalog filter", async () => {
    const { loadReportExportRows } = await import("@/lib/report-export");
    await expect(loadReportExportRows("workspace-1", { team: "deleted-team" })).rejects.toThrow("Фильтр отчета");
    expect(mocks.prisma.review.findMany).not.toHaveBeenCalled();
  });

  it("falls back to csatBucket and critical category exactly as before", async () => {
    mocks.prisma.review.findMany.mockResolvedValue([
      {
        ...reviewRow,
        criticalError: true,
        criticalCategory: "Нарушение скрипта",
        needsReanswer: true,
        reanswerStatus: "requested",
        appealStatus: "open",
        conversation: {
          ...reviewRow.conversation,
          assigneeName: null,
          supportLine: null,
          csatScore: null,
          csatBucket: "NEGATIVE"
        },
        findings: []
      }
    ]);

    const { loadReportExportRows } = await import("@/lib/report-export");
    const { rows, metrics } = await loadReportExportRows("workspace-1", { period: "last-30-days" });

    expect(rows[0]).toEqual([
      reviewRow.finalizedAt.toLocaleString("ru-RU"),
      "94 балла",
      "Нарушение скрипта",
      "requested",
      "open",
      "otrs_family",
      "OTRS-2451",
      "Консультация по статусу заявления",
      "Анна Смирнова",
      "",
      "Проверяющий",
      "",
      "NEGATIVE",
      "",
      "",
      "Ответ корректный; следующий шаг понятен."
    ]);
    expect(metrics).toEqual({
      finalizedCount: 1,
      averageScore: 94,
      criticalErrorCount: 1,
      highRiskCount: 0
    });
  });
});
