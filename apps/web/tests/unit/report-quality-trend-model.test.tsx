import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { ChartDataTable } from "@/components/charts/chart-data-table";
import { QualityTrendVisual } from "@/components/charts/recharts-visuals.client";
import type { ChartModel } from "@/lib/charts/contracts";
import { buildQualityTrendModel } from "@/lib/reports/report-chart-models";
import type { ReportPeriod } from "@/lib/report-period";
import { reportDateInputValue } from "@/lib/report-period";
import { buildScoreTrendRows, type ReportTrendReview } from "@/lib/report-trends";

vi.mock("next/link", () => ({
  default: ({
    scroll,
    prefetch,
    ...props
  }: ComponentProps<"a"> & { scroll?: boolean; prefetch?: boolean }) => (
    <a
      {...props}
      data-next-scroll={scroll === undefined ? undefined : String(scroll)}
      data-next-prefetch={prefetch === undefined ? undefined : String(prefetch)}
    />
  )
}));

describe("reports page quality-trend model seam", () => {
  it("chains raw reviews through buckets and model into two visual segments and a semantic missing-data row", () => {
    const period: ReportPeriod = {
      preset: "custom",
      start: new Date("2026-07-01T00:00:00.000Z"),
      end: new Date("2026-07-03T23:59:59.999Z"),
      label: "1–3 июля"
    };
    const rawReviews: ReportTrendReview[] = [
      {
        finalizedAt: new Date("2026-07-01T10:00:00.000Z"),
        totalScore: 72
      },
      {
        finalizedAt: new Date("2026-07-03T10:00:00.000Z"),
        totalScore: 86
      }
    ];
    const rows = buildScoreTrendRows(
      rawReviews,
      period,
      "day",
      (start, end) =>
        `/reviews?finalizedFrom=${reportDateInputValue(start)}&finalizedTo=${reportDateInputValue(end)}`
    );
    const model = buildQualityTrendModel({
      rows,
      previousAverageScore: 78
    });

    expect(model.points).toHaveLength(3);
    expect(model.points[1]).toMatchObject({
      label: "02.07",
      values: {
        score: null,
        previous: 78,
        target: 90,
        volume: 0
      },
      sampleSize: 0,
      href: "/reviews?finalizedFrom=2026-07-02&finalizedTo=2026-07-02"
    });

    const { container } = render(
      <>
        <QualityTrendVisual model={model} visibleSeries={["score"]} />
        <ChartDataTable model={model} />
      </>
    );

    expect(container.querySelector('[data-series="score"]')).toHaveAttribute(
      "data-segment-count",
      "2"
    );
    const tableRows = screen.getAllByRole("row");
    expect(tableRows).toHaveLength(4);
    expect(within(tableRows[2]).getByRole("rowheader")).toHaveTextContent("02.07");
    expect(within(tableRows[2]).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "Нет данных",
      "78",
      "90",
      "0",
      "0"
    ]);
  });

  it("preserves position and disables prefetch only for exact report evidence rows", () => {
    const evidenceHref =
      `/reports?view=overview&evidenceType=trend&evidenceKey=ev1_${"B".repeat(43)}`;
    const model: ChartModel = {
      id: "evidence-table",
      title: "Тренд",
      description: "Проверка ссылок",
      emptyTitle: "Нет данных",
      series: [
        {
          key: "score",
          label: "Оценка",
          unit: "quality-score",
          tone: "primary"
        }
      ],
      points: [
        {
          id: "evidence",
          label: "Доказательство",
          sortKey: "1",
          values: { score: 80 },
          href: evidenceHref
        },
        {
          id: "ordinary",
          label: "Обычная ссылка",
          sortKey: "2",
          values: { score: 81 },
          href: "/reviews?period=current"
        }
      ]
    };

    render(<ChartDataTable model={model} />);

    const evidenceLink = screen.getByRole("link", {
      name: "Доказательство"
    });
    const ordinaryLink = screen.getByRole("link", {
      name: "Обычная ссылка"
    });

    expect(evidenceLink).toHaveAttribute("data-next-scroll", "false");
    expect(evidenceLink).toHaveAttribute("data-next-prefetch", "false");
    expect(ordinaryLink).not.toHaveAttribute("data-next-scroll");
    expect(ordinaryLink).toHaveAttribute("data-next-prefetch", "false");
  });
});
