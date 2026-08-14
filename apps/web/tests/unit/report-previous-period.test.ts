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

const period = {
  preset: "last-30-days",
  label: "Последние 30 дней",
  start: new Date("2026-04-01T00:00:00.000Z"),
  end: new Date("2026-04-30T23:59:59.999Z")
} as const;

describe("loadPreviousFinalizedReviews narrow select", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("selects only the columns the previous-period computations read", async () => {
    mocks.prisma.review.findMany.mockResolvedValue([]);

    const { loadPreviousFinalizedReviews } = await import("@/lib/reports/report-page-data");
    await loadPreviousFinalizedReviews("workspace-1", period as never);

    const call = mocks.prisma.review.findMany.mock.calls[0][0];

    expect(call.include).toBeUndefined();
    expect(call.select).toEqual({
      totalScore: true,
      finalizedAt: true,
      conversation: {
        select: {
          externalSource: true,
          assigneeName: true,
          teamName: true
        }
      },
      scores: {
        select: {
          value: true,
          passed: true,
          isNotApplicable: true,
          criterion: {
            select: {
              block: true,
              kind: true
            }
          }
        }
      }
    });
    expect(call.where).toMatchObject({
      workspaceId: "workspace-1",
      status: "FINALIZED"
    });
    expect(call.where.finalizedAt).toEqual({ gte: period.start, lte: period.end });
  });

  it("feeds the score-math helpers identically to the full review shape", async () => {
    // Two rows shaped like the narrow select. blockRows + averageScoreFor must
    // produce the same numbers they would from the wider previous-period rows.
    const narrowRows = [
      {
        totalScore: 80,
        conversation: { externalSource: "otrs_family", assigneeName: "Анна", teamName: "ФГИС" },
        scores: [
          { value: 3, passed: false, isNotApplicable: false, criterion: { block: "Решение", kind: "SCALE" } },
          { value: null, passed: true, isNotApplicable: false, criterion: { block: "Тон", kind: "PASS_FAIL" } }
        ]
      },
      {
        totalScore: 60,
        conversation: { externalSource: "otrs_family", assigneeName: "Борис", teamName: "ФГИС" },
        scores: [
          { value: 0, passed: false, isNotApplicable: false, criterion: { block: "Решение", kind: "SCALE" } }
        ]
      }
    ];
    mocks.prisma.review.findMany.mockResolvedValue(narrowRows);

    const { loadPreviousFinalizedReviews } = await import("@/lib/reports/report-page-data");
    const { averageScoreFor, blockRows } = await import("@/lib/reports/report-aggregation");

    const rows = await loadPreviousFinalizedReviews("workspace-1", period as never);

    expect(averageScoreFor(rows)).toBe(70); // (80 + 60) / 2
    const blocks = new Map(blockRows(rows).map((row) => [row.label, row]));
    // Решение: [100 (value 3), 0 (value 0)] -> avg 50; Тон: PASS_FAIL passed -> 100.
    expect(blocks.get("Решение")).toEqual({ label: "Решение", count: 2, averageScore: 50 });
    expect(blocks.get("Тон")).toEqual({ label: "Тон", count: 1, averageScore: 100 });
  });
});
