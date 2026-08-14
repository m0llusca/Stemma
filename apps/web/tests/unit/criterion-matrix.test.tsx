import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { CriterionMatrix } from "@/components/reports/criterion-matrix";

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

const evidenceHref =
  `/reports?view=performance&evidenceType=matrix&evidenceKey=ev1_${"A".repeat(43)}`;

const columns = [
  { key: "solution", label: "Решение" },
  { key: "empathy", label: "Эмпатия" }
];

const rows = [
  {
    key: "operator-1",
    label: "Иван Петров",
    meta: "12 проверок",
    cells: {
      solution: { value: 82, count: 12 },
      empathy: { value: 76, count: 12 }
    }
  }
];

const teamAverage = {
  label: "Среднее по команде",
  meta: "42 проверки",
  cells: {
    solution: { value: 86, count: 42 },
    empathy: { value: 81, count: 42 }
  }
};

describe("CriterionMatrix", () => {
  it("owns horizontal scrolling through one named focusable region", () => {
    const { container } = render(
      <CriterionMatrix
        columns={columns}
        rows={rows}
        teamAverage={teamAverage}
      />
    );

    const region = screen.getByRole("region", {
      name: "Матрица критериев"
    });
    const tableContainer = region.querySelector(
      ':scope > [data-slot="table-container"]'
    );

    expect(region).toHaveAttribute("tabindex", "0");
    expect(region).toHaveClass(
      "overflow-x-auto",
      "[&>[data-slot=table-container]]:overflow-visible"
    );
    expect(tableContainer).toBeInTheDocument();
    expect(tableContainer).not.toHaveAttribute("role");
    expect(tableContainer).not.toHaveAttribute("tabindex");
    expect(container.querySelectorAll('[role="region"][tabindex="0"]')).toHaveLength(
      1
    );
  });

  it("accepts the report heading as the optional accessible-name owner", () => {
    render(
      <>
        <h2 id="criterion-matrix-title">Качество по критериям</h2>
        <CriterionMatrix
          columns={columns}
          rows={rows}
          teamAverage={teamAverage}
          scrollRegionLabelledBy="criterion-matrix-title"
        />
      </>
    );

    const region = screen.getByRole("region", {
      name: "Качество по критериям"
    });

    expect(region).toHaveAttribute(
      "aria-labelledby",
      "criterion-matrix-title"
    );
    expect(region).not.toHaveAttribute("aria-label");
  });

  it("keeps sticky opaque headers with explicit column and row scopes", () => {
    render(
      <CriterionMatrix
        columns={columns}
        rows={rows}
        teamAverage={teamAverage}
      />
    );

    const table = screen.getByRole("table");
    const tableHeader = table.querySelector('[data-slot="table-header"]');
    const columnHeaders = within(table).getAllByRole("columnheader");
    const rowHeaders = within(table).getAllByRole("rowheader");
    const teamRowHeader = within(
      screen.getByRole("row", { name: /Среднее по команде/ })
    ).getByRole("rowheader");

    expect(tableHeader).toHaveClass("sticky", "top-0", "bg-card");
    for (const header of columnHeaders) {
      expect(header).toHaveAttribute("scope", "col");
    }
    for (const header of rowHeaders) {
      expect(header).toHaveAttribute("scope", "row");
      expect(header).toHaveClass("sticky", "left-0");
    }
    expect(columnHeaders[0]).toHaveClass(
      "sticky",
      "left-0",
      "bg-card"
    );
    expect(teamRowHeader).toHaveClass("bg-muted");
    expect(teamRowHeader).not.toHaveClass("bg-muted/40");
  });

  it("keeps the lowest intensity bucket on the solid primary pairing for WCAG text contrast", () => {
    // P3: bg-primary/55 with text-primary-foreground measured 2.3–3.2:1 across
    // themes (axe color-contrast); the densest bucket must use the solid
    // primary pairing (same as default buttons), which stays ≥4.5:1.
    render(
      <CriterionMatrix
        columns={columns}
        rows={[
          {
            ...rows[0],
            cells: {
              solution: { value: 61, count: 8, href: "/reviews?criterion=solution" },
              empathy: { value: 33, count: 8, href: "/reviews?criterion=empathy" }
            }
          }
        ]}
      />
    );

    const weakCell = screen.getByRole("link", { name: "61" });
    const criticalCell = screen.getByRole("link", { name: "33" });

    for (const cell of [weakCell, criticalCell]) {
      expect(cell).toHaveClass("bg-primary", "text-primary-foreground");
      expect(cell.className).not.toContain("bg-primary/55");
    }
  });

  it("preserves position and disables prefetch only for exact report evidence links", () => {
    render(
      <CriterionMatrix
        columns={columns}
        rows={[
          {
            ...rows[0],
            href: evidenceHref,
            cells: {
              solution: { value: 82, count: 12, href: evidenceHref },
              empathy: {
                value: 76,
                count: 12,
                href: "/reviews?criterion=empathy"
              }
            }
          },
          {
            ...rows[0],
            key: "operator-2",
            label: "Анна Смирнова",
            href: "/reviews?assignee=operator-2"
          }
        ]}
      />
    );

    const evidenceRowLink = screen.getByRole("link", {
      name: /Иван Петров/
    });
    const evidenceCellLink = screen.getByRole("link", { name: "82" });
    const ordinaryRowLink = screen.getByRole("link", {
      name: /Анна Смирнова/
    });
    const ordinaryCellLink = screen.getByRole("link", { name: "76" });

    for (const link of [evidenceRowLink, evidenceCellLink]) {
      expect(link).toHaveAttribute("data-next-scroll", "false");
      expect(link).toHaveAttribute("data-next-prefetch", "false");
    }
    for (const link of [ordinaryRowLink, ordinaryCellLink]) {
      expect(link).not.toHaveAttribute("data-next-scroll");
      expect(link).toHaveAttribute("data-next-prefetch", "false");
    }
  });
});
