"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageReviewWorkflow, getCurrentUser, requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function safeReviewsHref(value: string) {
  if (!value || !value.startsWith("/reviews") || value.startsWith("//")) {
    return "/reviews";
  }

  try {
    const parsed = new URL(value, "http://local.qc");

    if (parsed.origin !== "http://local.qc" || parsed.pathname !== "/reviews") {
      return "/reviews";
    }

    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "/reviews";
  }
}

export async function createSavedQueueView(formData: FormData) {
  const user = await getCurrentUser();
  const name = stringField(formData, "name");
  const href = safeReviewsHref(stringField(formData, "href"));
  const scope = stringField(formData, "scope") === "workspace" ? "workspace" : "private";

  if (!name) {
    throw new Error("Название представления обязательно.");
  }

  if (scope === "workspace" && !canManageReviewWorkflow(user.role)) {
    throw new Error("Нет прав на общие представления очереди.");
  }

  await prisma.savedQueueView.create({
    data: {
      workspaceId: user.workspaceId,
      userId: scope === "private" ? user.id : null,
      name,
      href,
      scope,
      order: 50
    }
  });

  revalidatePath("/reviews");
  redirect(href);
}

export async function deleteSavedQueueView(formData: FormData) {
  const user = await getCurrentUser();
  const id = stringField(formData, "id");

  if (!id) {
    throw new Error("Представление не найдено.");
  }

  await prisma.savedQueueView.deleteMany({
    where: {
      id,
      workspaceId: user.workspaceId,
      ...(canManageReviewWorkflow(user.role) ? { OR: [{ userId: user.id }, { scope: "workspace" }] } : { userId: user.id })
    }
  });

  revalidatePath("/reviews");
}

// Открывает самое срочное непроверенное обращение для ручной проверки.
// Только навигация: ничего не назначает и не меняет, чтобы избежать гонок при параллельной работе.
// where + orderBy зеркалят приоритет очереди проверок (reviewDueAt — SLA-срочность, см. фильтр due=overdue).
export async function takeNextReview() {
  const user = await requireCurrentUserPermission("reviews:read");

  const supportAgentScope: Prisma.ConversationWhereInput =
    user.role === "SUPPORT_AGENT" ? { assigneeName: user.name } : {};

  const conversation = await prisma.conversation.findFirst({
    where: {
      workspaceId: user.workspaceId,
      qaStatus: { not: "FINALIZED" },
      ...supportAgentScope
    },
    orderBy: [{ reviewDueAt: { sort: "asc", nulls: "last" } }, { openedAt: "desc" }],
    select: { id: true }
  });

  if (!conversation) {
    redirect("/reviews?empty=1");
  }

  redirect(`/reviews/${conversation.id}`);
}
