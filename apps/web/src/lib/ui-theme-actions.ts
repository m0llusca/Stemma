"use server";

import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import {
  defaultBrandAccentColor,
  defaultBrandPrimaryColor,
  isBrandHexColor,
  isBrandLogoUrl,
  isUiContrastId,
  isUiCornersId,
  isUiDensityId,
  isUiThemeId,
  normalizeBrandMark,
  normalizeBrandText,
  serializeUiPaletteOverrides,
  validateUiPaletteOverridesJson
} from "@/lib/ui-theme";

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function updateWorkspaceAppearance(formData: FormData) {
  const user = await requireCurrentUserPermission("appearance:manage");
  const uiTheme = stringField(formData, "uiTheme");
  const uiDensity = stringField(formData, "uiDensity");
  const uiCorners = stringField(formData, "uiCorners");
  const uiContrast = stringField(formData, "uiContrast");
  const brandName = normalizeBrandText(stringField(formData, "brandName"), 64);
  const brandTagline = normalizeBrandText(stringField(formData, "brandTagline"), 96);
  const brandLogoUrl = stringField(formData, "brandLogoUrl");
  const brandLogoAlt = normalizeBrandText(stringField(formData, "brandLogoAlt"), 96);
  const brandMark = normalizeBrandMark(stringField(formData, "brandMark"));
  const brandPrimaryColor = stringField(formData, "brandPrimaryColor") || defaultBrandPrimaryColor;
  const brandAccentColor = stringField(formData, "brandAccentColor") || defaultBrandAccentColor;
  const uiPaletteOverrides = validateUiPaletteOverridesJson(stringField(formData, "uiPaletteOverridesJson"));
  const uiPaletteOverridesJson = serializeUiPaletteOverrides(uiPaletteOverrides);

  if (!isUiThemeId(uiTheme)) {
    throw new Error("Неизвестная цветовая тема.");
  }

  if (!isUiDensityId(uiDensity)) {
    throw new Error("Неизвестная плотность интерфейса.");
  }

  if (!isUiCornersId(uiCorners)) {
    throw new Error("Неизвестный радиус интерфейса.");
  }

  if (!isUiContrastId(uiContrast)) {
    throw new Error("Неизвестная контрастность интерфейса.");
  }

  if (!isBrandLogoUrl(brandLogoUrl)) {
    throw new Error("Логотип должен быть HTTPS-ссылкой или загруженным PNG, JPG или WebP до 240 КБ.");
  }

  if (!isBrandHexColor(brandPrimaryColor) || !isBrandHexColor(brandAccentColor)) {
    throw new Error("Цвета бренда должны быть в формате #RRGGBB.");
  }

  const workspace = await prisma.workspace.update({
    where: { id: user.workspaceId },
    data: {
      brandName: brandName || null,
      brandTagline: brandTagline || null,
      brandLogoUrl: brandLogoUrl || null,
      brandLogoAlt: brandLogoAlt || null,
      brandMark: brandMark || null,
      brandPrimaryColor,
      brandAccentColor,
      uiTheme,
      uiDensity,
      uiCorners,
      uiContrast,
      uiPaletteOverridesJson
    },
    select: {
      id: true,
      brandName: true,
      brandTagline: true,
      brandLogoUrl: true,
      brandLogoAlt: true,
      brandMark: true,
      brandPrimaryColor: true,
      brandAccentColor: true,
      uiTheme: true,
      uiDensity: true,
      uiCorners: true,
      uiContrast: true,
      uiPaletteOverridesJson: true
    }
  });

  await auditLog({
    workspaceId: user.workspaceId,
    actorId: user.id,
    action: "workspace.appearance_updated",
    targetType: "workspace",
    targetId: workspace.id,
    metadata: {
      brandName: workspace.brandName,
      brandTagline: workspace.brandTagline,
      brandLogoAlt: workspace.brandLogoAlt,
      brandMark: workspace.brandMark,
      brandPrimaryColor: workspace.brandPrimaryColor,
      brandAccentColor: workspace.brandAccentColor,
      hasBrandLogo: Boolean(workspace.brandLogoUrl),
      uiTheme: workspace.uiTheme,
      uiDensity: workspace.uiDensity,
      uiCorners: workspace.uiCorners,
      uiContrast: workspace.uiContrast,
      paletteOverrideKeys: Object.keys(uiPaletteOverrides)
    }
  });

  revalidatePath("/", "layout");
  revalidatePath("/admin");
  revalidatePath("/admin/appearance");
}

export const updateWorkspaceUiTheme = updateWorkspaceAppearance;
