"use server";

import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { isUiContrastId, isUiCornersId, isUiDensityId, isUiThemeId } from "@/lib/ui-theme";

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

  const workspace = await prisma.workspace.update({
    where: { id: user.workspaceId },
    data: {
      uiTheme,
      uiDensity,
      uiCorners,
      uiContrast
    },
    select: {
      id: true,
      uiTheme: true,
      uiDensity: true,
      uiCorners: true,
      uiContrast: true
    }
  });

  await auditLog({
    workspaceId: user.workspaceId,
    actorId: user.id,
    action: "workspace.appearance_updated",
    targetType: "workspace",
    targetId: workspace.id,
    metadata: {
      uiTheme: workspace.uiTheme,
      uiDensity: workspace.uiDensity,
      uiCorners: workspace.uiCorners,
      uiContrast: workspace.uiContrast
    }
  });

  revalidatePath("/", "layout");
  revalidatePath("/admin");
  revalidatePath("/admin/appearance");
}

export const updateWorkspaceUiTheme = updateWorkspaceAppearance;
