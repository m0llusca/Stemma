export const defaultBrandName = "КК поддержки";
export const defaultBrandTagline = "Ручная проверка";
export const defaultBrandMark = "КК";
export const defaultBrandPrimaryColor = "#3157d5";
export const defaultBrandAccentColor = "#7c97ff";
export const maxBrandLogoUrlLength = 360_000;

const brandHexColorPattern = /^#[0-9A-Fa-f]{6}$/;
const brandHttpsLogoPattern = /^https:\/\/[^\s"'<>]+$/i;
const brandDataLogoPattern =
  /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

export function normalizeBrandText(
  value: string | null | undefined,
  maxLength: number
) {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function isBrandHexColor(
  value: string | null | undefined
): value is string {
  return Boolean(value && brandHexColorPattern.test(value));
}

export function resolveBrandColor(
  value: string | null | undefined,
  fallback: string
) {
  return isBrandHexColor(value) ? value : fallback;
}

export function isBrandLogoUrl(value: string | null | undefined) {
  if (!value) {
    return true;
  }

  if (value.length > maxBrandLogoUrlLength) {
    return false;
  }

  return brandHttpsLogoPattern.test(value) || brandDataLogoPattern.test(value);
}

export function normalizeBrandLogoUrl(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  return normalized && isBrandLogoUrl(normalized) ? normalized : "";
}

export function normalizeBrandMark(value: string | null | undefined) {
  const normalized = normalizeBrandText(value, 8).toLocaleUpperCase("ru-RU");
  return Array.from(normalized).slice(0, 3).join("");
}

export function resolveWorkspaceBranding(
  input: {
    brandName?: string | null;
    brandTagline?: string | null;
    brandLogoUrl?: string | null;
    brandLogoAlt?: string | null;
    brandMark?: string | null;
    brandPrimaryColor?: string | null;
    brandAccentColor?: string | null;
    uiPaletteOverridesJson?: string | null;
  } = {}
) {
  const brandName = normalizeBrandText(input.brandName, 64) || defaultBrandName;
  const brandTagline =
    normalizeBrandText(input.brandTagline, 96) || defaultBrandTagline;

  return {
    brandName,
    brandTagline,
    brandLogoUrl: normalizeBrandLogoUrl(input.brandLogoUrl),
    brandLogoAlt: normalizeBrandText(input.brandLogoAlt, 96) || brandName,
    brandMark: normalizeBrandMark(input.brandMark) || defaultBrandMark,
    brandPrimaryColor: resolveBrandColor(
      input.brandPrimaryColor,
      defaultBrandPrimaryColor
    ),
    brandAccentColor: resolveBrandColor(
      input.brandAccentColor,
      defaultBrandAccentColor
    )
  };
}

export type WorkspaceBranding = ReturnType<typeof resolveWorkspaceBranding>;
