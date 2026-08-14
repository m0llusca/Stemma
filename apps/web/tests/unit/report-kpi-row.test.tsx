import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReportKpiRow } from "@/components/reports/report-kpi-row";

const items = [
  {
    label: "Риск HIGH+",
    value: "4",
    detail: "12% всех замечаний",
    progress: 12,
    progressLabel: "доля риска"
  },
  {
    label: "Открытые разборы",
    value: "3",
    detail: "8% к объёму проверок",
    progress: 8,
    progressLabel: "нагрузка разбора"
  },
  {
    label: "Источники",
    value: "5",
    detail: "Топ: OTRS",
    progress: 40,
    progressLabel: "концентрация"
  },
  {
    label: "Норма",
    value: "86%",
    detail: "43 из 50 проверок",
    progress: 86,
    progressLabel: "выполнение"
  }
];

describe("ReportKpiRow", () => {
  it("fills six desktop tracks with a two-track score hero and no orphan KPI", () => {
    render(
      <ReportKpiRow
        scoreLabel="Средняя оценка"
        scoreValue="84"
        scoreUnit="балла"
        scoreHint="42 проверки"
        scoreHref="/reviews"
        items={items}
      />
    );

    const grid = screen.getByRole("list", {
      name: "Ключевые показатели периода"
    });
    const tiles = screen.getAllByRole("listitem");
    const trackSpans = tiles.map((tile) =>
      Number(tile.getAttribute("data-desktop-track-span"))
    );

    expect(grid).toHaveAttribute("data-desktop-tracks", "6");
    expect(grid).toHaveClass(
      "grid-cols-1",
      "min-[390px]:grid-cols-2",
      "xl:grid-cols-6"
    );
    expect(grid).not.toHaveClass("sm:grid-cols-2");
    expect(trackSpans).toEqual([2, 1, 1, 1, 1]);
    expect(trackSpans.reduce((sum, span) => sum + span, 0)).toBe(6);
    expect(tiles[0]).toHaveClass(
      "min-[390px]:col-span-2",
      "xl:col-span-2"
    );
    expect(tiles[0]).not.toHaveClass("sm:col-span-2");
    for (const tile of tiles) {
      expect(tile).not.toHaveClass(
        "hover:-translate-y-px",
        "transition-[box-shadow,transform]"
      );
    }
    expect(tiles[0]).toHaveAttribute("data-tablet-track-span", "2");
    expect(tiles.slice(1).map((tile) => tile.getAttribute("data-tablet-track-span"))).toEqual([
      "1",
      "1",
      "1",
      "1"
    ]);
  });

  it("uses semantic status tokens for score and supporting KPI badges", () => {
    render(
      <ReportKpiRow
        scoreLabel="Средняя оценка"
        scoreValue="84"
        scoreDelta={{ value: "3 балла", direction: "up" }}
        items={[
          { ...items[0], tone: "ok" },
          { ...items[1], tone: "warn" },
          { ...items[2], tone: "danger" },
          items[3]
        ]}
      />
    );

    expect(screen.getByText("↑ 3 балла")).toHaveClass(
      "bg-success-soft",
      "text-success"
    );
    expect(screen.getByText("норма")).toHaveClass(
      "bg-success-soft",
      "text-success"
    );
    expect(screen.getByText("внимание")).toHaveClass(
      "bg-warning-soft",
      "text-warning"
    );
    expect(screen.getByText("риск")).toHaveClass(
      "bg-destructive-soft",
      "text-destructive"
    );
  });
});
