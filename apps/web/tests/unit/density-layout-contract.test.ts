import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = (rel: string) => readFileSync(join(process.cwd(), "src", rel), "utf8");

describe("density layout contract (#166)", () => {
  it("PageShell chrome reads Appearance density tokens", () => {
    const pageShell = src("components/ui/page-shell.tsx");

    expect(pageShell).toContain("gap-(--section-gap)");
    expect(pageShell).toContain("p-(--page-shell-padding)");
    expect(pageShell).not.toContain("gap-6");
    expect(pageShell).not.toContain("gap-7");
    expect(pageShell).not.toContain("p-3 md:p-6");
  });

  it("Card drops gap when the header has a border so callers do not stack pt", () => {
    const card = src("components/ui/card.tsx");

    expect(card).toContain("has-[[data-slot=card-header].border-b]:gap-0");
    expect(card).toContain("overflow-visible");
    expect(card).not.toContain("overflow-hidden");
  });

  it("Empty stretch is opt-in and inline empty stays compact", () => {
    const empty = src("components/ui/empty.tsx");
    const emptyState = src("components/ui/empty-state.tsx");

    expect(empty).not.toMatch(/data-slot="empty"[\s\S]*flex-1/);
    expect(emptyState).toContain("py-3");
    expect(emptyState).not.toContain("py-6");
    expect(emptyState).not.toContain("py-12");
  });

  it("Lead quality and Exec empty/error align to content, not leftover min-h holes", () => {
    const dashboard = src("app/dashboard/page.tsx");
    const execEmpty = src("components/dashboard/exec-risk-empty.tsx");
    const execIsland = src("components/dashboard/exec-risk-chart-island.client.tsx");

    expect(dashboard).not.toContain("min-h-[260px]");
    expect(dashboard).not.toContain("min-h-[62px]");
    expect(dashboard).not.toContain("min-h-[42px]");
    expect(execEmpty).toContain("EXEC_RISK_CHART_MIN_HEIGHT_CLASS");
    expect(execEmpty).not.toContain("min-h-[200px]");
    expect(execIsland).toContain("EXEC_RISK_CHART_MIN_HEIGHT_CLASS");
    expect(execIsland).not.toContain("min-h-[240px]");
  });

  it("self-review packs are an accordion collapsed to one open review", () => {
    const page = src("app/self-review/page.tsx");

    expect(page).toContain("Accordion");
    expect(page).toContain("keepMounted={false}");
    expect(page).toContain("multiple={false}");
    expect(page).toContain("defaultValue={[actionConversations[0].id]}");
  });

  it("queue SLA/OTRS chrome is collapsed and rows stay compact", () => {
    const preview = src("components/review/queue-next-case-preview.tsx");
    const filtersHelp = src("components/review/queue-advanced-filters.tsx");
    const table = src("components/review/queue-table.tsx");
    const workspace = src("components/review/queue-workspace.tsx");

    expect(preview).not.toContain("h-full");
    expect(filtersHelp).toContain('className="sr-only"');
    expect(table).toContain("h-auto py-1.5");
    expect(workspace).toContain("gap-(--section-gap)");
    expect(workspace).toContain("items-start");
  });

  it("topbar and admin frame honor density tokens", () => {
    const topbar = src("components/app-nav-shell.tsx");
    const adminFrame = src("components/admin/admin-frame.tsx");

    expect(topbar).toContain("px-(--app-topbar-inline)");
    expect(topbar).toContain('title="Поиск или команда"');
    expect(adminFrame).toContain("lg:gap-(--section-gap)");
    expect(adminFrame).not.toContain("lg:gap-7");
  });
});
