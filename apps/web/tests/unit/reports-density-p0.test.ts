import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  RANKED_BAR_FILL,
  RANKED_BREAKDOWN_VIEWBOX,
  RANKED_PLOT_MAX_HEIGHT,
  RANKED_ROW_HEIGHT,
  rankedBarHeight,
  rankedPlotHeight
} from "@/lib/charts/plot-geometry";

const src = (rel: string) => readFileSync(join(process.cwd(), "src", rel), "utf8");

/**
 * #172 P0 density locks. Add a new `describe` per follow-up FAIL from the
 * full-app walk — do not open a second PR.
 */
describe("reports density P0 (#172)", () => {
  it("agreement plot height hugs rows instead of a 220px clamp", () => {
    expect(RANKED_ROW_HEIGHT).toBe(22);
    expect(RANKED_BAR_FILL).toBe(0.82);
    expect(rankedBarHeight(22)).toBeGreaterThan(RANKED_ROW_HEIGHT * 0.7);
    expect(RANKED_PLOT_MAX_HEIGHT).toBe(360);
    expect(rankedPlotHeight(1, RANKED_BREAKDOWN_VIEWBOX.margin)).toBe(34);
    expect(rankedPlotHeight(5, RANKED_BREAKDOWN_VIEWBOX.margin)).toBeLessThan(220);
    expect(rankedPlotHeight(20, RANKED_BREAKDOWN_VIEWBOX.margin)).toBe(360);

    const geometry = src("lib/charts/plot-geometry.ts");
    expect(geometry).toContain("rankedPlotHeight(model.points.length, margin)");
    expect(geometry).not.toContain("Math.max(220, model.points.length * 36)");

    const visual = src("components/charts/recharts-visuals.client.tsx");
    expect(visual).toContain('preserveAspectRatio="none"');
    expect(visual).not.toContain("aspectRatio: `${width} / ${height}`");

    const agreement = src("components/reports/analytics-intelligence.tsx");
    expect(agreement).toContain('plotMinHeight="hug"');
  });

  it("overview charts sit in equal columns; driver chain and CTAs stay compact", () => {
    const views = src("components/reports/report-page-views.tsx");
    expect(views).toContain('data-slot="report-overview-charts"');
    expect(views).toContain("xl:grid-cols-2");
    expect(views).not.toContain("xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]");
    expect(views).toContain("DriverChainCard");
    expect(views).toContain('data-slot="report-deepen-analysis"');
    expect(views).toContain("flex flex-wrap items-center gap-2");
    expect(views).not.toContain("md:grid-cols-3");
    expect(views).toContain('className={cn(buttonVariants({ variant: "secondary", size: "xs" }), "w-fit shrink-0")}');

    const panels = src("components/reports/report-panels.tsx");
    expect(panels).toContain('data-slot="report-driver-chain"');
    expect(panels).toContain("sm:grid-cols-2 xl:grid-cols-3");
    expect(panels).toContain('plotMinHeight="hug"');
  });

  it("Люди / Статусы fill a content grid instead of two thin leftover cards", () => {
    const views = src("components/reports/report-page-views.tsx");
    expect(views).toContain('data-slot="report-details-people"');
    expect(views).toContain('data-slot="report-details-statuses"');
    expect(views).toContain('aria-label="Люди"');
    expect(views).toContain('aria-label="Статусы"');
    expect(views).toContain("xl:grid-cols-3");
    expect(views).toContain("items-start");
    expect(views).not.toContain("xl:grid-cols-[minmax(16rem,0.85fr)_minmax(0,1fr)]");

    const index = src("components/reports/report-panels.tsx");
    expect(index).toContain('data-slot="report-details-index"');
    expect(index).toContain("flex flex-wrap items-center gap-2");
  });

  it("разрез tables hug content and do not force a horizontal scrollbar", () => {
    const tables = src("components/reports/report-tables.tsx");
    expect(tables).toContain("w-full table-fixed");
    expect(tables).toContain("overflow-hidden");
    expect(tables).toContain("h-fit");
    expect(tables).toContain("max-w-0 truncate");
    const breakdown = tables.slice(
      tables.indexOf("export function BreakdownTable"),
      tables.indexOf("export function QuotaTable")
    );
    expect(breakdown).toContain("table-fixed");
    expect(breakdown).not.toContain("min-w-max");
    expect(breakdown).not.toContain("overflow-x-auto");
  });
});

describe("reports density follow-up FAIL (#172)", () => {
  it("Marques: ChartFrame ready/loading never reserve a 240px hole", () => {
    const frame = src("components/charts/chart-frame.tsx");
    expect(frame).not.toContain("min-h-60");
    expect(frame).toContain('className="h-16"');
    expect(frame).toContain("h-fit gap-0 py-0");
  });

  it("Marques: quota table is content-sized with sticky first column, not min-w-max", () => {
    const tables = src("components/reports/report-tables.tsx");
    const quota = tables.slice(tables.indexOf("export function QuotaTable"));
    expect(quota).toContain("w-full table-fixed");
    expect(quota).toContain("sticky left-0");
    expect(quota).toContain("whitespace-normal");
    expect(quota).not.toContain("min-w-max");
    expect(quota).toContain(">Открыть<");
    expect(quota).not.toContain("Открыть проверки оператора");
  });

  it("Marques: ranked list and performance cards stay compact", () => {
    const charts = src("components/reports/report-charts.tsx");
    expect(charts).toContain("h-fit gap-0 overflow-clip py-0");
    expect(charts).toContain("py-1.5 first:pt-0");
    expect(src("components/reports/report-page-views.tsx")).toContain(
      "grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3"
    );
  });
});
