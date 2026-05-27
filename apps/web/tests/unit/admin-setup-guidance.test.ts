import { describe, expect, it } from "vitest";
import {
  getMissingSettingsCoachmarks,
  hasAppearancePaletteOverrides,
  isSettingBlockConfigured
} from "@/lib/admin-setup-guidance";

describe("admin setup guidance", () => {
  it("returns coachmarks only for settings blocks that are still unset", () => {
    const missing = getMissingSettingsCoachmarks({
      activeScorecardVersion: null,
      activeSamplingRules: 0,
      integrationCount: 0,
      activeIntegrationCount: 0,
      nonDemoProviderCount: 0,
      activeProviderCount: 0,
      activeGroupMappings: 0,
      apiTokenCount: 0,
      userCount: 1,
      brandLogoUrl: "",
      uiPaletteOverridesJson: "{}"
    });

    expect(missing.map((item) => item.id)).toEqual([
      "scorecards",
      "sampling",
      "integrations",
      "access",
      "users",
      "apiTokens",
      "brandLogo",
      "componentPalette"
    ]);

    const configured = getMissingSettingsCoachmarks({
      activeScorecardVersion: 3,
      activeSamplingRules: 4,
      integrationCount: 2,
      activeIntegrationCount: 1,
      nonDemoProviderCount: 1,
      activeProviderCount: 1,
      activeGroupMappings: 2,
      apiTokenCount: 1,
      userCount: 8,
      brandLogoUrl: "https://cdn.example.com/logo.png",
      uiPaletteOverridesJson: '{"buttonPrimaryBg":"#274fc7"}'
    });

    expect(configured).toEqual([]);
  });

  it("treats partial integration and access setup as still requiring guidance", () => {
    expect(isSettingBlockConfigured("integrations", { integrationCount: 1, activeIntegrationCount: 0 })).toBe(false);
    expect(isSettingBlockConfigured("integrations", { integrationCount: 1, activeIntegrationCount: 1 })).toBe(true);

    expect(isSettingBlockConfigured("access", { nonDemoProviderCount: 1, activeProviderCount: 0 })).toBe(false);
    expect(isSettingBlockConfigured("access", { nonDemoProviderCount: 1, activeProviderCount: 1 })).toBe(true);
  });

  it("recognizes custom appearance palette overrides", () => {
    expect(hasAppearancePaletteOverrides("{}")).toBe(false);
    expect(hasAppearancePaletteOverrides("")).toBe(false);
    expect(hasAppearancePaletteOverrides("not-json")).toBe(false);
    expect(hasAppearancePaletteOverrides('{"sidebarBg":"#101720"}')).toBe(true);
  });
});
