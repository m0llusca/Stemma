import type { ReviewQueueFilters, ReviewQueueSearchParams } from "@/lib/contracts/review-queue";
import { parseReviewQueueFilters } from "@/lib/review-repository";

export function safeReviewsHref(value: string) {
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
 * Queue href the workbench button would pass as `queueHref`.
 * - `/reviews` (+ search) → that URL (active chips / saved view)
 * - `/reviews/:id?returnTo=` → sanitized returnTo
 * - anywhere else → undefined (unfiltered SLA take-next, not a fake status URL)
 */
export function queueHrefFromLocation(pathname: string, search = ""): string | undefined {
  const query = search.startsWith("?") || search === "" ? search : `?${search}`;

  if (pathname === "/reviews") {
    return `${pathname}${query}`;
  }

  if (pathname.startsWith("/reviews/")) {
    const returnTo = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query).get("returnTo");
    return returnTo ? safeReviewsHref(returnTo) : undefined;
  }

  return undefined;
}

/** Same FormData the queue / pulse / ⌘K / preview «Взять следующий» submit. */
export function takeNextFormDataFromLocation(pathname: string, search = ""): FormData {
  const formData = new FormData();
  const queueHref = queueHrefFromLocation(pathname, search);
  if (queueHref) {
    formData.set("queueHref", queueHref);
  }
  return formData;
}

/** True when the parsed queue view has a chip or search constraint — not just `empty`/`page`/`saved`. */
export function hasActiveQueueFilters(filters: ReviewQueueFilters): boolean {
  return (
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
    Boolean(filters.finalizedTo)
  );
}

/**
 * Extract queue filters from a safe `/reviews?...` href (queue form or
 * workbench returnTo). Returns undefined when there is no meaningful filter set
 * so take-next keeps the unfiltered SLA order.
 *
 * Lives outside `"use server"` modules: Next.js only allows async exports there.
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
    return hasActiveQueueFilters(filters) ? filters : undefined;
  } catch {
    return undefined;
  }
}
