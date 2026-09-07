import { describe, expect, it } from "vitest";
import {
  filtersFromReviewsHref,
  hasActiveQueueFilters,
  queueHrefFromLocation,
  takeNextFormDataFromLocation
} from "@/lib/review/queue-href-filters";
import { parseReviewQueueFilters } from "@/lib/review-repository";

describe("queueHrefFromLocation", () => {
  it("keeps the active queue URL including filters", () => {
    expect(queueHrefFromLocation("/reviews", "?due=overdue&qaAssignee=Анна")).toBe(
      "/reviews?due=overdue&qaAssignee=Анна"
    );
    expect(queueHrefFromLocation("/reviews", "process=ai_exception")).toBe(
      "/reviews?process=ai_exception"
    );
    expect(queueHrefFromLocation("/reviews")).toBe("/reviews");
  });

  it("reads workbench returnTo the same way finalize-and-take-next does", () => {
    expect(
      queueHrefFromLocation("/reviews/conv-1", "?returnTo=%2Freviews%3Fdue%3Doverdue")
    ).toBe("/reviews?due=overdue");
  });

  it("does not invent /reviews?status=unreviewed off the queue", () => {
    expect(queueHrefFromLocation("/dashboard")).toBeUndefined();
    expect(queueHrefFromLocation("/reviews/conv-1")).toBeUndefined();
    expect(queueHrefFromLocation("/reports")).toBeUndefined();
  });
});

describe("takeNextFormDataFromLocation", () => {
  it("submits the same queueHref field as the queue button, ⌘K, and pulse", () => {
    const formData = takeNextFormDataFromLocation("/reviews", "?due=overdue");
    expect(formData.get("queueHref")).toBe("/reviews?due=overdue");
  });

  it("omits queueHref when there is no active queue view", () => {
    const formData = takeNextFormDataFromLocation("/dashboard");
    expect(formData.get("queueHref")).toBeNull();
  });
});

describe("hasActiveQueueFilters", () => {
  it("ignores empty/page/saved markers so a take-next redirect is not a filter", () => {
    expect(hasActiveQueueFilters(parseReviewQueueFilters({ empty: "1", page: "2", saved: "final" }))).toBe(
      false
    );
    expect(filtersFromReviewsHref("/reviews?empty=1&saved=final")).toBeUndefined();
  });

  it("treats a chip on the take-next empty redirect as an active view", () => {
    expect(hasActiveQueueFilters(parseReviewQueueFilters({ due: "overdue", empty: "1" }))).toBe(true);
    expect(filtersFromReviewsHref("/reviews?due=overdue&empty=1")).toEqual(
      expect.objectContaining({ due: "overdue" })
    );
  });
});
