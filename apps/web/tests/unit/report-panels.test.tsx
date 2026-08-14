import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { ProcessSummary } from "@/components/reports/report-panels";
import type { ReportPeriod } from "@/lib/report-period";

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

const period: ReportPeriod = {
  preset: "vk-current",
  start: new Date("2026-07-01T00:00:00.000Z"),
  end: new Date("2026-07-28T00:00:00.000Z"),
  label: "Текущий период"
};

describe("ProcessSummary", () => {
  it("follows the dl content model: per-card dl holds only dt/dd, icon and link stay outside", () => {
    // P5-final: a div inside dl may contain ONLY dt/dd (plus script-supporting
    // elements), so the icon span and the stretched link must not live inside
    // any dl grouping. Each process card owns a one-group dl whose direct
    // children are exactly dt, dd (value), dd (detail).
    const { container } = render(
      <ProcessSummary
        criticalCount={3}
        reanswerCount={5}
        appealCount={2}
        period={period}
      />
    );

    const lists = container.querySelectorAll("dl");
    expect(lists).toHaveLength(3);

    for (const list of lists) {
      expect(Array.from(list.children).map((child) => child.tagName)).toEqual([
        "DT",
        "DD",
        "DD"
      ]);
      expect(list.querySelector("a")).toBeNull();
      expect(list.querySelector("span")).toBeNull();
      expect(list.querySelector("p")).toBeNull();
    }

    // The stretched link and the icon live inside the card but outside the dl.
    const critical = screen.getByRole("link", { name: /Критические ошибки/ });
    expect(critical.closest("dl")).toBeNull();
    const card = critical.closest("div");
    expect(card?.querySelector(":scope > span")).not.toBeNull();
    expect(card?.querySelector(":scope > dl")).not.toBeNull();
    expect(card?.querySelector(":scope > a")).toBe(critical);
  });

  it("keeps every process item a whole-card link with an accessible name and visual layout", () => {
    render(
      <ProcessSummary
        criticalCount={3}
        reanswerCount={5}
        appealCount={2}
        period={period}
      />
    );

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(3);

    const critical = screen.getByRole("link", { name: /Критические ошибки/ });
    expect(critical).toHaveAttribute(
      "aria-label",
      expect.stringContaining("3") as unknown as string
    );
    expect(critical).toHaveAttribute(
      "href",
      expect.stringContaining("process=critical") as unknown as string
    );
    // Stretched-link overlay: the whole card stays clickable and the focus
    // ring lands on the card outline exactly as before.
    expect(critical).toHaveClass("absolute", "inset-0", "rounded-lg");

    const card = critical.closest("div");
    // The per-card dl IS the text column now, so the original flex row +
    // column geometry applies verbatim — no grid emulation needed. Same
    // padding, border, radius and hover as the pre-restructure markup.
    expect(card).toHaveClass(
      "relative",
      "flex",
      "min-w-0",
      "items-start",
      "gap-3",
      "rounded-lg",
      "border",
      "border-border",
      "bg-muted/30",
      "p-3"
    );
    expect(card?.className).toContain("hover:bg-muted/60");

    const column = card?.querySelector(":scope > dl");
    expect(column).toHaveClass("min-w-0", "flex", "flex-col", "gap-0.5");
  });
});
