import { describe, expect, it } from "vitest";
import { activeAreaForPath, topNavAreas } from "@/lib/shell/navigation";

describe("topNavAreas", () => {
  it("exposes the five primary product areas in order", () => {
    expect(topNavAreas.map((area) => area.id)).toEqual(["today", "review", "calibration", "coaching", "analytics"]);
  });

  it("derives labels and hrefs from the shell mode model", () => {
    const byId = Object.fromEntries(topNavAreas.map((area) => [area.id, area]));

    expect(byId.today.href).toBe("/dashboard");
    expect(byId.review.href).toBe("/reviews");
    expect(byId.calibration.href).toBe("/calibration");
    expect(byId.coaching.href).toBe("/coaching");
    expect(byId.analytics.href).toBe("/reports");
  });
});

describe("activeAreaForPath", () => {
  it("matches a nested review path to the review area", () => {
    expect(activeAreaForPath("/reviews/abc")).toBe("review");
  });

  it("matches the reports root to the analytics area", () => {
    expect(activeAreaForPath("/reports")).toBe("analytics");
  });

  it("matches the calibration root to the calibration area", () => {
    expect(activeAreaForPath("/calibration")).toBe("calibration");
  });

  it("matches the dashboard root to the today area", () => {
    expect(activeAreaForPath("/dashboard")).toBe("today");
  });

  it("matches a nested coaching path to the coaching area", () => {
    expect(activeAreaForPath("/coaching/task-1")).toBe("coaching");
  });

  it("uses the longest matching prefix", () => {
    // /reviews and /self-review must not collide; /self-review has no area.
    expect(activeAreaForPath("/self-review")).toBeNull();
  });

  it("returns null for admin paths that do not map to a primary area", () => {
    expect(activeAreaForPath("/admin/integrations")).toBeNull();
  });

  it("returns null for unknown paths", () => {
    expect(activeAreaForPath("/totally-unknown")).toBeNull();
  });
});
