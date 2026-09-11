import { describe, expect, it, vi, afterEach } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  KINETICS_ORIGIN,
  KINETICS_PACKAGE,
  kineticsDurationMs,
  kineticsDurations,
  kineticsEasings,
  kineticsMorphSpring,
  kineticsStyle,
  kineticsSurfaces,
  kineticsTransition,
  prefersReducedMotion
} from "@stemma/kinetics";

const appRoot = process.cwd();
const requireFromApp = createRequire(resolve(appRoot, "package.json"));

describe("@stemma/kinetics", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves as a workspace package and exposes the spring catalog", () => {
    expect(KINETICS_PACKAGE).toBe("@stemma/kinetics");
    expect(KINETICS_ORIGIN).toContain("kinetics.colorion.co");
    expect(kineticsDurations.springEnter).toBe("550ms");
    expect(kineticsDurationMs.springEnter).toBe(550);
    expect(kineticsDurationMs.feedbackFlash).toBe(1200);
    expect(kineticsEasings.overshoot).toContain("cubic-bezier");
    expect(kineticsEasings.gentle).toContain("cubic-bezier");
    expect(kineticsMorphSpring).toBe("snappy");
    expect(kineticsTransition("transform", "overshoot")).toContain(
      "var(--motion-duration-spring)"
    );
    expect(kineticsStyle("width", "overshoot")).toEqual({
      transition: kineticsTransition("width", "overshoot")
    });
    expect(kineticsSurfaces).toEqual(
      expect.arrayContaining([
        "progress",
        "sheet",
        "dialog",
        "alert-dialog",
        "hover-lift",
        "top-nav",
        "evidence-jump",
        "inline-bar"
      ])
    );

    const packagePath = requireFromApp.resolve("@stemma/kinetics/package.json");
    expect(packagePath).toMatch(/packages[/\\]kinetics[/\\]package\.json$/);
    const tokensCss = readFileSync(
      requireFromApp.resolve("@stemma/kinetics/tokens.css"),
      "utf8"
    );
    expect(tokensCss).toContain("--motion-ease-spring-overshoot:");
    expect(tokensCss).toContain("--motion-ease-spring-gentle:");
    expect(tokensCss).toContain("--motion-scale-hover-lift:");
  });

  it("reads prefers-reduced-motion synchronously for event handlers", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    );
    expect(prefersReducedMotion()).toBe(true);
  });
});
