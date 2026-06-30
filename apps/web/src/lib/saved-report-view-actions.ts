"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/auth/permissions";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { safeReportsHref } from "@/lib/saved-report-view";

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Persists a saved report view for the current user. Both create and delete are
 * gated behind the report surface permission ("reports:read"); promoting a view
 * to workspace-wide ("shared") additionally requires "reports:manage".
 */
export async function createSavedReportView(formData: FormData) {
  const user = await requireCurrentUserPermission("reports:read");
  const name = stringField(formData, "name");
  const href = safeReportsHref(stringField(formData, "href"));
  const scope = stringField(formData, "scope") === "shared" ? "shared" : "private";

  if (!name) {
    throw new Error("Название представления обязательно.");
  }

  if (scope === "shared" && !hasPermission(user.role, "reports:manage")) {
    throw new Error("Нет прав на общие представления отчётов.");
  }

  await prisma.savedReportView.create({
    data: {
      workspaceId: user.workspaceId,
      userId: scope === "private" ? user.id : null,
      name,
      href,
      scope,
      order: 50
    }
  });

  revalidatePath("/reports");
  redirect(href);
}

export async function deleteSavedReportView(formData: FormData) {
  const user = await requireCurrentUserPermission("reports:read");
  const id = stringField(formData, "id");

  if (!id) {
    throw new Error("Представление не найдено.");
  }

  await prisma.savedReportView.deleteMany({
    where: {
      id,
      workspaceId: user.workspaceId,
      ...(hasPermission(user.role, "reports:manage")
        ? { OR: [{ userId: user.id }, { scope: "shared" }] }
        : { userId: user.id })
    }
  });

  revalidatePath("/reports");
}
