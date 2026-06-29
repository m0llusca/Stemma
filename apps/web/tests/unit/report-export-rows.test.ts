import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    review: {
      findMany: vi.fn()
    }
  }
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

// One finalized review row as it now arrives from the narrow `select`. The
// fields here are exactly the ones the CSV/XLSX/PDF rows read — nothing else.
const reviewRow = {
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
  });

  it("requests only the columns the export rows consume (select, not include)", async () => {
    mocks.prisma.review.findMany.mockResolvedValue([]);

    const { loadReportExportRows } = await import("@/lib/report-export");
    await loadReportExportRows("workspace-1", { period: "last-30-days" });

    const call = mocks.prisma.review.findMany.mock.calls[0][0];

    // No whole-row include is allowed — that was the performance regression.
    expect(call.include).toBeUndefined();
    expect(call.select).toEqual({
      finalizedAt: true,
      totalScore: true,
      criticalError: true,
      criticalCategory: true,
      needsReanswer: true,
      reanswerStatus: true,
      appealStatus: true,
      summary: true,
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
    const { rows } = await loadReportExportRows("workspace-1", { period: "last-30-days" });

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
  });
});
