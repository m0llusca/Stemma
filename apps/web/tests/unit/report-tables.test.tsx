import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BreakdownTable, QuotaTable } from "@/components/reports/report-tables";
import type { ReportPeriod } from "@/lib/report-period";

const period: ReportPeriod = {
  preset: "vk-current",
  start: new Date("2026-07-22T00:00:00.000Z"),
  end: new Date("2026-08-21T00:00:00.000Z"),
  label: "22.07.2026 - 21.08.2026"
};

function expectNamedScrollRegion(regionName: string, slot: string) {
  const region = screen.getByRole("region", { name: regionName });
  const table = within(region).getByRole("table");

  expect(region).toHaveAttribute("data-slot", slot);
  expect(region).toHaveAttribute("tabindex", "0");
  expect(region).toHaveClass(
    "overflow-x-auto",
    "[&>[data-slot=table-container]]:overflow-visible"
  );
  expect(table).toHaveClass("min-w-max");
}

describe("report table scroll regions", () => {
  it("wraps the breakdown table in one named focusable scroll region", () => {
    render(
      <BreakdownTable
        title="Категории"
        rows={[
          {
            label: "Эмпатия",
            count: 12,
            averageScore: 82,
            href: "/reviews?criterion=empathy"
          }
        ]}
        countLabel="Замечаний"
        showAverage
      />
    );

    expectNamedScrollRegion("Категории", "report-table-scroll-region");
  });

  it("wraps the quota table in one named focusable scroll region", () => {
    render(
      <QuotaTable
        quotas={[
          {
            assigneeName: "Иван Петров",
            supportLine: null,
            plannedCount: 20,
            dsatTargetPercent: 10,
            absenceDays: 0,
            note: null
          }
        ]}
        reviews={[]}
        period={period}
      />
    );

    expectNamedScrollRegion("Нормы проверок", "report-table-scroll-region");
  });
});
