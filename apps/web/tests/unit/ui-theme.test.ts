import { describe, expect, it } from "vitest";
import {
  isBrandLogoUrl,
  resolveUiAppearance,
  resolveWorkspaceBranding,
  serializeUiPaletteOverrides,
  uiPaletteOverridesToCssVariables,
  validateUiPaletteOverridesJson
} from "@/lib/ui-theme";

describe("workspace appearance", () => {
  it("normalizes branding values for shell rendering", () => {
    const branding = resolveWorkspaceBranding({
      brandName: "  Support   QA  ",
      brandTagline: " Операционный   контроль ",
      brandMark: " qa!",
      brandPrimaryColor: "#0f766e",
      brandAccentColor: "#2dd4bf"
    });

    expect(branding).toMatchObject({
      brandName: "Support QA",
      brandTagline: "Операционный контроль",
      brandMark: "QA!",
      brandPrimaryColor: "#0f766e",
      brandAccentColor: "#2dd4bf"
    });
  });

  it("falls back from invalid logo and color values", () => {
    const appearance = resolveUiAppearance({
      brandLogoUrl: "javascript:alert(1)",
      brandPrimaryColor: "red",
      brandAccentColor: "#12345"
    });

    expect(appearance.brandLogoUrl).toBe("");
    expect(appearance.brandPrimaryColor).toBe("#3157d5");
    expect(appearance.brandAccentColor).toBe("#7c97ff");
    expect(isBrandLogoUrl("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
    expect(isBrandLogoUrl("data:image/svg+xml;base64,PHN2Zy8+")).toBe(false);
  });

  it("keeps only valid palette override tokens for rendering", () => {
    const appearance = resolveUiAppearance({
      uiPaletteOverridesJson: JSON.stringify({
        buttonPrimaryBg: "#123456",
        sidebarBg: "#0f172a",
        unknown: "#ffffff",
        danger: "red"
      })
    });

    expect(appearance.uiPaletteOverrides).toEqual({
      buttonPrimaryBg: "#123456",
      sidebarBg: "#0f172a"
    });
    expect(appearance.uiPaletteOverridesJson).toBe('{"buttonPrimaryBg":"#123456","sidebarBg":"#0f172a"}');
    expect(uiPaletteOverridesToCssVariables(appearance.uiPaletteOverrides)).toMatchObject({
      "--button-primary-bg": "#123456",
      "--sidebar-bg": "#0f172a"
    });
  });

  it("rejects invalid palette override payloads for persistence", () => {
    expect(() => validateUiPaletteOverridesJson('{"unknown":"#ffffff"}')).toThrow("неизвестный токен");
    expect(() => validateUiPaletteOverridesJson('{"danger":"red"}')).toThrow("#RRGGBB");
    expect(serializeUiPaletteOverrides({ danger: "#b91c1c", buttonPrimaryBg: "#123456" })).toBe(
      '{"buttonPrimaryBg":"#123456","danger":"#b91c1c"}'
    );
  });
});
