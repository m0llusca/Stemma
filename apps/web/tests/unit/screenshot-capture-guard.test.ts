import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * D1 guard: full-page screenshot captures must arm deferred charts before the
 * shot, otherwise below-fold charts land in the pixels as blank skeleton
 * slabs (2026-07-29 preliminary matrix defect). The app's own ready marker is
 * data-deferred-state="ready" on [data-slot="deferred-chart-visual"] (see
 * src/components/charts/deferred-chart-visual.client.tsx and
 * tests/unit/deferred-chart-visual.test.tsx).
 */

function specSource(name: string) {
  return readFileSync(path.join(process.cwd(), "tests", "e2e", name), "utf8");
}

const SETTLE_CALL = "await settleDeferredCharts(page);";

describe("screenshot capture deferred-chart arming", () => {
  it("arms every deferred chart to its ready marker in the Task 8 capture helper", () => {
    const source = specSource("task8-screenshot-capture.spec.ts");

    expect(source).toContain('data-slot="deferred-chart-visual"');
    expect(source).toContain("scrollIntoViewIfNeeded");
    expect(source).toContain('"data-deferred-state", "ready"');
  });

  it("settles deferred charts before every full-page capture in the Task 8 spec", () => {
    const source = specSource("task8-screenshot-capture.spec.ts");
    const shot = "page.screenshot(";

    let searchFrom = 0;
    let captureCount = 0;
    for (;;) {
      const shotAt = source.indexOf(shot, searchFrom);
      if (shotAt === -1) {
        break;
      }
      expect(source.slice(searchFrom, shotAt)).toContain(SETTLE_CALL);
      searchFrom = shotAt + shot.length;
      captureCount += 1;
    }
    expect(captureCount).toBe(3);
  });

  it("settles deferred charts in every chart-route opener of the appearance matrix", () => {
    const source = specSource("appearance-visual.spec.ts");

    expect(source).toContain('data-slot="deferred-chart-visual"');
    expect(source).toContain("scrollIntoViewIfNeeded");
    expect(source).toContain('"data-deferred-state", "ready"');

    for (const helper of [
      "openDashboard",
      "openReportsOverviewGraph",
      "openReportsOverviewTable"
    ]) {
      const start = source.indexOf(`async function ${helper}`);
      expect(start, `${helper} exists`).toBeGreaterThanOrEqual(0);
      const body = source.slice(start, source.indexOf("\n}", start));
      expect(body, `${helper} arms charts before capture`).toContain(
        SETTLE_CALL
      );
    }
  });
});
