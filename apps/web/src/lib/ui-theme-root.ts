import {
  getUiThemeOption,
  uiPaletteOverridesToCssVariables,
  uiPaletteTokenOptions,
  type UiAppearance,
  type UiPaletteToken
} from "@/lib/ui-theme";

const canonicalCssVariableByPaletteToken: Partial<
  Record<UiPaletteToken, `--${string}`>
> = {
  buttonPrimaryBg: "--primary",
  buttonPrimaryText: "--primary-foreground",
  sidebarBg: "--sidebar",
  panel: "--card",
  danger: "--destructive"
};

const derivedPaletteCssVariableNames = [
  "--accent-soft",
  "--accent-muted",
  "--accent-border",
  "--control-selected-bg",
  "--control-selected-border",
  "--sidebar-glow",
  "--sidebar-active-icon",
  "--success-soft",
  "--warning-soft",
  "--danger-soft"
] as const;

export const managedUiAppearanceCssVariableNames = [
  "--brand-primary",
  "--brand-accent",
  ...uiPaletteTokenOptions.map((token) => token.cssVariable),
  ...derivedPaletteCssVariableNames,
  ...Object.values(canonicalCssVariableByPaletteToken)
] as const;

export function uiAppearanceToCssVariables(appearance: UiAppearance) {
  const cssVariables: Record<string, string> = {
    "--brand-primary": appearance.brandPrimaryColor,
    "--brand-accent": appearance.brandAccentColor,
    ...uiPaletteOverridesToCssVariables(appearance.uiPaletteOverrides)
  };

  for (const [token, cssVariable] of Object.entries(
    canonicalCssVariableByPaletteToken
  ) as [UiPaletteToken, `--${string}`][]) {
    const value = appearance.uiPaletteOverrides[token];

    if (value) {
      cssVariables[cssVariable] = value;
    }
  }

  return cssVariables;
}

export function appearanceRootProps(appearance: UiAppearance) {
  const mode = getUiThemeOption(appearance.uiTheme).mode;

  return {
    "data-theme": appearance.uiTheme,
    "data-density": appearance.uiDensity,
    "data-corners": appearance.uiCorners,
    "data-contrast": appearance.uiContrast,
    className: mode === "dark" ? "dark" : undefined,
    style: {
      colorScheme: mode,
      ...uiAppearanceToCssVariables(appearance)
    }
  };
}
