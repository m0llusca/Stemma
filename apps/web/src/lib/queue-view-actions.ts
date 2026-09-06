"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ReviewQueueFilters, ReviewQueueSearchParams } from "@/lib/contracts/review-queue";
import { canManageReviewWorkflow, getCurrentUser, requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { nextReviewOrderBy, nextReviewWhere, type NextReviewUser } from "@/lib/review/next-review-query";
import { buildReviewQueueWhere, parseReviewQueueFilters } from "@/lib/review-repository";

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

/**
 * Extract queue filters from a safe `/reviews?...` href (queue form or
 * workbench returnTo). Returns undefined when there is no meaningful filter set
 * so take-next keeps the unfiltered SLA order.
 */
export function filtersFromReviewsHref(href: string | undefined): ReviewQueueFilters | undefined {
  if (!href) {
    return undefined;
  }

  const safe = safeReviewsHref(href);
  try {
    const parsed = new URL(safe, "http://local.qc");
    const searchParams: ReviewQueueSearchParams = {};
    parsed.searchParams.forEach((value, key) => {
      const existing = searchParams[key as keyof ReviewQueueSearchParams];
      if (existing === undefined) {
        (searchParams as Record<string, string | string[]>)[key] = value;
      } else if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        (searchParams as Record<string, string | string[]>)[key] = [existing, value];
      }
    });
    const filters = parseReviewQueueFilters(searchParams);
    const hasActiveFilter =
      Boolean(filters.q) ||
      filters.status !== "all" ||
      Boolean(filters.channel) ||
      Boolean(filters.qaStatus) ||
      Boolean(filters.source) ||
      Boolean(filters.assignee) ||
      Boolean(filters.qaAssignee) ||
      Boolean(filters.samplingType) ||
      Boolean(filters.csatBucket) ||
      Boolean(filters.qaScoreBand) ||
      Boolean(filters.supportLine) ||
      Boolean(filters.teamName) ||
      Boolean(filters.process) ||
      Boolean(filters.due) ||
      Boolean(filters.riskLevel) ||
      Boolean(filters.coachingStatus) ||
      Boolean(filters.findingCategory) ||
      Boolean(filters.criticalCategory) ||
      Boolean(filters.feedbackStatus) ||
      Boolean(filters.appealStatus) ||
      Boolean(filters.reanswerStatus) ||
      Boolean(filters.finalizedFrom) ||
      Boolean(filters.finalizedTo);

    return hasActiveFilter ? filters : undefined;
  } catch {
    return undefined;
  }
}

function emptyQueueRedirect(queueHref: string | undefined): never {
  const base = queueHref ? safeReviewsHref(queueHref) : "/reviews";
  const sep = base.includes("?") ? "&" : "?";
  redirect(`${base}${sep}empty=1`);
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

// Resolves the id of the next conversation to grade, or null when the queue is
// empty for this user. Only reads — never assigns or mutates — to avoid races
// during parallel work. Priority order + scope live in the shared pure helper so
// the queue button and the "finalize & take next" workbench action never drift.
// Optional filters keep take-next inside the active queue URL view.
export async function selectNextReviewConversationId(
  user: NextReviewUser,
  excludeConversationId?: string,
  filters?: ReviewQueueFilters
): Promise<string | null> {
  const base = nextReviewWhere(user, excludeConversationId);
  const where = filters ? { AND: [base, buildReviewQueueWhere(user.workspaceId, filters)] } : base;
  const conversation = await prisma.conversation.findFirst({
    where,
    orderBy: nextReviewOrderBy,
    select: { id: true }
  });

  return conversation?.id ?? null;
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
