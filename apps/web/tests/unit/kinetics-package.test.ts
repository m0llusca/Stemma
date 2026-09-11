import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  KINETICS_ORIGIN,
  KINETICS_PACKAGE,
  kineticsDurations,
  kineticsEasings,
  kineticsSurfaces,
  kineticsTransition
} from "@stemma/kinetics";

const appRoot = process.cwd();
const requireFromApp = createRequire(resolve(appRoot, "package.json"));

describe("@stemma/kinetics", () => {
  it("resolves as a workspace package and exposes the spring catalog", () => {
    expect(KINETICS_PACKAGE).toBe("@stemma/kinetics");
    expect(KINETICS_ORIGIN).toContain("kinetics.colorion.co");
    expect(kineticsDurations.springEnter).toBe("550ms");
    expect(kineticsEasings.overshoot).toContain("cubic-bezier");
    expect(kineticsTransition("transform", "overshoot")).toContain(
      "var(--motion-duration-spring)"
    );
    expect(kineticsSurfaces).toEqual(
      expect.arrayContaining([
        "progress",
        "sheet",
        "dialog",
        "alert-dialog",
        "hover-lift",
        "top-nav"
      ])
    );
    expect(kineticsEasings.gentle).toContain("cubic-bezier");

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
});
