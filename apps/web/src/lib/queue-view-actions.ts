"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageReviewWorkflow, requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { filtersFromReviewsHref, safeReviewsHref } from "@/lib/review/queue-href-filters";
import { selectNextReviewConversationId } from "@/lib/review/select-next-review-conversation";

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function emptyQueueRedirect(queueHref: string | undefined): never {
  const base = queueHref ? safeReviewsHref(queueHref) : "/reviews";
  const sep = base.includes("?") ? "&" : "?";
  redirect(`${base}${sep}empty=1`);
}

// Same reviews:write honesty as takeNextReview — readers may apply existing
// views, but create/rename/delete must not be a session-only mutate.
export async function createSavedQueueView(formData: FormData) {
  const user = await requireCurrentUserPermission("reviews:write");
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
  const user = await requireCurrentUserPermission("reviews:write");
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
// Optional FormData `queueHref` carries the active queue filters so take-next
// stays inside the filtered view.
export async function takeNextReview(formData?: FormData) {
  const user = await requireCurrentUserPermission("reviews:write");
  const queueHref = formData ? stringField(formData, "queueHref") : "";
  const filters = filtersFromReviewsHref(queueHref || undefined);

  const nextId = await selectNextReviewConversationId(user, undefined, filters);

  if (!nextId) {
    emptyQueueRedirect(queueHref || undefined);
  }

  const returnTo = queueHref ? safeReviewsHref(queueHref) : undefined;
  if (returnTo && returnTo !== "/reviews") {
    redirect(`/reviews/${nextId}?returnTo=${encodeURIComponent(returnTo)}`);
  }

  redirect(`/reviews/${nextId}`);
}
