import { describe, expect, it } from "vitest";
import {
  resolveUiAppearance,
  type ThemeDefinition,
  uiThemeOptions
} from "@/lib/ui-theme";
import {
  appearanceRootProps,
  uiAppearanceToCssVariables
} from "@/lib/ui-theme-root";
import { syncUiAppearanceToDocument } from "@/lib/ui-theme-dom";

function appearance(
  uiTheme: string,
  uiPaletteOverridesJson = "{}"
) {
  return resolveUiAppearance({
    uiTheme,
    uiPaletteOverridesJson
  });
}

describe("root appearance contract", () => {
  it("describes every theme with an explicit light or dark mode", () => {
    const definitions: readonly ThemeDefinition[] = uiThemeOptions;

    expect(definitions).toHaveLength(7);
    expect(definitions.map(({ id, mode }) => [id, mode])).toEqual([
      ["graphite", "light"],
      ["azure", "light"],
      ["emerald", "light"],
      ["violet", "light"],
      ["amber", "light"],
      ["rose", "light"],
      ["ops", "dark"]
    ]);
  });

  it("returns a complete normalized root state for Graphite and Ops", () => {
    const graphite = appearanceRootProps(appearance("graphite"));
    const ops = appearanceRootProps(appearance("ops"));

    expect(graphite).toMatchObject({
      "data-theme": "graphite",
      "data-density": "comfortable",
      "data-corners": "medium",
      "data-contrast": "standard",
      className: undefined,
      style: {
        colorScheme: "light",
        "--brand-primary": "#3157d5",
        "--brand-accent": "#7c97ff"
      }
    });
    expect(ops).toMatchObject({
      "data-theme": "ops",
      "data-density": "comfortable",
      "data-corners": "medium",
      "data-contrast": "standard",
      className: "dark",
      style: {
        colorScheme: "dark"
      }
    });
  });

  it("normalizes invalid persisted root values before exposing props", () => {
    const resolved = resolveUiAppearance({
      uiTheme: "unknown",
      uiDensity: "microscopic",
      uiCorners: "roundest",
      uiContrast: "maximum"
    });

    expect(appearanceRootProps(resolved)).toMatchObject({
      "data-theme": "graphite",
      "data-density": "comfortable",
      "data-corners": "medium",
      "data-contrast": "standard",
      className: undefined,
      style: { colorScheme: "light" }
    });
  });

  it("migrates legacy palette keys to canonical v2 variables while retaining bridges", () => {
    const variables = uiAppearanceToCssVariables(
      appearance(
        "graphite",
        JSON.stringify({
          buttonPrimaryBg: "#123456",
          buttonPrimaryText: "#fefefe",
          sidebarBg: "#101820",
          panel: "#ffffff",
          danger: "#a10000"
        })
      )
    );

    expect(variables).toMatchObject({
      "--primary": "#123456",
      "--primary-foreground": "#fefefe",
      "--sidebar": "#101820",
      "--card": "#ffffff",
      "--destructive": "#a10000",
      "--button-primary-bg": "#123456",
      "--button-primary-text": "#fefefe",
      "--sidebar-bg": "#101820",
      "--panel": "#ffffff",
      "--danger": "#a10000"
    });
  });

  it("finishes all 49 ordered transitions at the destination without stale variables", () => {
    for (const source of uiThemeOptions) {
      for (const destination of uiThemeOptions) {
        const root = document.createElement("div");

        syncUiAppearanceToDocument(
          root,
          appearance(
            source.id,
            JSON.stringify({
              buttonPrimaryBg: "#123456",
              panel: "#fefefe"
            })
          )
        );
        syncUiAppearanceToDocument(root, appearance(destination.id));

        expect(root.dataset.theme).toBe(destination.id);
        expect(root.dataset.density).toBe("comfortable");
        expect(root.dataset.corners).toBe("medium");
        expect(root.dataset.contrast).toBe("standard");
        expect(root.classList.contains("dark")).toBe(destination.mode === "dark");
        expect(root.style.colorScheme).toBe(destination.mode);
        expect(root.style.getPropertyValue("--button-primary-bg")).toBe("");
        expect(root.style.getPropertyValue("--primary")).toBe("");
        expect(root.style.getPropertyValue("--panel")).toBe("");
        expect(root.style.getPropertyValue("--card")).toBe("");
      }
    }
  });

  it("applies the same appearance idempotently", () => {
    const root = document.createElement("div");
    const resolved = appearance(
      "ops",
      JSON.stringify({
        accent: "#4488ff",
        warning: "#dd8800"
      })
    );

    syncUiAppearanceToDocument(root, resolved);
    const first = root.outerHTML;
    syncUiAppearanceToDocument(root, resolved);

    expect(root.outerHTML).toBe(first);
  });
});
