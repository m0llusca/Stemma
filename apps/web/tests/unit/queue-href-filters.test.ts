import { describe, expect, it } from "vitest";
import {
  queueHrefFromLocation,
  takeNextFormDataFromLocation
} from "@/lib/review/queue-href-filters";

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
