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
    expect(frame).not.toMatch(/className=\{[^}]*min-h-60/);
    expect(frame).not.toMatch(/className="[^"]*min-h-60/);
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
    expect(quota).toMatch(/>\s*Открыть\s*</);
    expect(quota).not.toContain("Открыть проверки оператора");

    const views = src("components/reports/report-page-views.tsx");
    expect(views).toContain('data-slot="report-details-quotas"');
    const criteria = views.slice(
      views.indexOf('data-slot="report-details-criteria"'),
      views.indexOf('data-slot="report-details-people"')
    );
    expect(criteria).toContain("md:grid-cols-2");
    expect(criteria).not.toContain("xl:grid-cols-3");
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

describe("Jamal deep-walk FAIL (#172)", () => {
  it("P0 self-review packs stay collapsed: one open, closed height 0, subject is not a link", () => {
    const page = src("app/self-review/page.tsx");
    expect(page).toContain("defaultValue={[actionConversations[0].id]}");
    expect(page).toContain("multiple={false}");
    expect(page).toContain("hiddenUntilFound");
    expect(page).not.toMatch(/<AccordionTrigger[\s\S]{0,800}<Link/);
    expect(page).toMatch(/<Accordion\s+multiple=\{false\} hiddenUntilFound/);

    const accordion = src("components/ui/accordion.tsx");
    expect(accordion).toContain("data-closed:h-0");
    expect(accordion).toContain("data-open:h-(--accordion-panel-height)");

    const css = src("app/globals.css");
    expect(css).toContain('hidden="until-found"');
    expect(css).toContain("height: 0 !important");
    expect(css).toContain("min-height: 0 !important");
  });

  it("P1 coaching empty copy is role-aware and empty charts do not reserve a hole", () => {
    const coaching = src("app/coaching/page.tsx");
    expect(coaching).toContain("coachingPlansEmptyDescription(user.role)");
    expect(coaching).toContain("COACHING_PLANS_AGENT_EMPTY_BODY");
    expect(coaching).toContain("trendPoints.length >= 2 || topCategories.length > 0");
    expect(coaching).not.toContain("canShowScoreTrend || topCategories.length > 0");
  });

  it("P1 calibration appeal empty stays compact", () => {
    const calibration = src("app/calibration/page.tsx");
    expect(calibration).toContain("Подтверждённые и скорректированные апелляции появятся здесь.");
    expect(calibration).toContain('size="inline"');
    expect(calibration).not.toContain("Исходы апелляций (подтверждена / скорректирована)");
  });

  it("P1 chrome role switcher exposes title= and pending menu opens upward", () => {
    const switcher = src("components/auth/demo-role-switch.tsx");
    expect(switcher).toContain("title={user.optionLabel}");
    expect(switcher).toContain('side="top"');
    expect(switcher).toContain("bottom-full mb-2");
    expect(switcher).toContain("max-h-[min(24rem,calc(100dvh-1rem))]");
  });

  it("P1 QA filter reset clears qaAssignee and due, not role-home inbox", () => {
    const home = src("lib/auth/role-home.ts");
    expect(home).toContain("Always the unfiltered queue — including QA.");
    expect(home).toContain("return \"/reviews\"");
  });

  it("P1 review title wraps with title= and context grid stays dense", () => {
    const shell = src("components/ui/page-shell.tsx");
    expect(shell).toContain("text-pretty");
    expect(shell).toContain("break-words");
    expect(shell).toContain('title={typeof title === "string" ? title : undefined}');

    const review = src("app/reviews/[conversationId]/page.tsx");
    expect(review).toContain("sm:grid-cols-3");
    expect(review).toContain("items-start gap-x-3 gap-y-2");
  });
});
